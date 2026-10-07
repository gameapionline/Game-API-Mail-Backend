import { simpleParser } from "mailparser";
import { supabaseAdmin } from "../supabase.js";
import { config } from "../config.js";
import { createImapClient } from "./hostinger.js";
import { getMailboxCredentials, getFolderId } from "../mailbox.js";
import { sendPushToUser } from "../push.js";

function cleanPreview(text) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, 300);
}

function addrName(address) { return address?.name || ""; }
function addrEmail(address) { return address?.address || ""; }

export async function syncMailbox(mailbox) {
  const credentials = await getMailboxCredentials(mailbox);
  if (!credentials) return { skipped: true, reason: "MAILBOX_CREDENTIALS_NOT_CONFIGURED" };

  const inboxFolderId = await getFolderId(mailbox.id, "INBOX");
  if (!inboxFolderId) throw new Error("INBOX folder is missing.");

  const client = createImapClient(credentials);
  let added = 0;

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");

    try {
      const { data: state } = await supabaseAdmin.from("mail_sync_state").select("*")
        .eq("mailbox_id", mailbox.id).maybeSingle();

      const lastUid = Number(state?.last_uid || 0);
      const search = lastUid > 0 ? { uid: (lastUid + 1) + ":*" } : { all: true };
      const items = [];

      for await (const item of client.fetch(search, {
        uid: true, envelope: true, source: true, flags: true, internalDate: true
      })) {
        items.push(item);
        if (items.length >= config.syncBatchSize) break;
      }

      for (const item of items) {
        if (!item.source) continue;
        const parsed = await simpleParser(item.source);
        const messageId = parsed.messageId || null;
        const sender = parsed.from?.value?.[0];

        let existingQuery = supabaseAdmin.from("messages").select("id").eq("mailbox_id", mailbox.id).limit(1);
        existingQuery = messageId
          ? existingQuery.eq("message_id", messageId)
          : existingQuery.eq("provider_uid", String(item.uid));

        const { data: existing } = await existingQuery.maybeSingle();
        if (existing) continue;

        const row = {
          mailbox_id: mailbox.id,
          folder_id: inboxFolderId,
          provider_uid: String(item.uid),
          message_id: messageId,
          thread_id: parsed.references?.[0] || messageId,
          in_reply_to: parsed.inReplyTo || null,
          sender_name: addrName(sender),
          sender_email: addrEmail(sender),
          subject: parsed.subject || "",
          body_text: parsed.text || null,
          body_html: parsed.html || null,
          preview: cleanPreview(parsed.text || parsed.html || ""),
          received_at: parsed.date?.toISOString?.() || item.internalDate?.toISOString?.() || new Date().toISOString(),
          is_read: item.flags?.has("\\Seen") || false,
          is_starred: false,
          is_important: false,
          has_attachments: (parsed.attachments || []).length > 0
        };

        const { data: inserted, error } = await supabaseAdmin.from("messages").insert(row)
          .select("id,subject,sender_name,sender_email").single();
        if (error) throw error;

        const recipients = [];
        for (const group of ["to", "cc"]) {
          for (const entry of parsed[group]?.value || []) {
            recipients.push({
              message_id: inserted.id,
              recipient_type: group,
              name: entry.name || null,
              email: entry.address
            });
          }
        }
        if (recipients.length) await supabaseAdmin.from("message_recipients").insert(recipients);

        const attachments = (parsed.attachments || []).map(file => ({
          message_id: inserted.id,
          file_name: file.filename || "attachment",
          content_type: file.contentType || "application/octet-stream",
          file_size: file.size || null,
          storage_path: "",
          content_id: file.cid || null
        }));
        if (attachments.length) await supabaseAdmin.from("attachments").insert(attachments);

        added++;
        await sendPushToUser(mailbox.owner_id, {
          title: row.sender_name || row.sender_email || "New message",
          body: row.subject || "You received a new email.",
          url: "/app.html"
        });
      }

      const highestUid = items.reduce((max, item) => Math.max(max, Number(item.uid || 0)), lastUid);

      await supabaseAdmin.from("mail_sync_state").upsert({
        mailbox_id: mailbox.id,
        last_synced_at: new Date().toISOString(),
        last_uid: String(highestUid),
        sync_status: "idle",
        last_error: null,
        updated_at: new Date().toISOString()
      }, { onConflict: "mailbox_id" });
    } finally {
      lock.release();
    }
  } catch (error) {
    await supabaseAdmin.from("mail_sync_state").upsert({
      mailbox_id: mailbox.id,
      last_synced_at: new Date().toISOString(),
      sync_status: "error",
      last_error: String(error.message || error).slice(0, 1000),
      updated_at: new Date().toISOString()
    }, { onConflict: "mailbox_id" });
    throw error;
  } finally {
    try { await client.logout(); } catch {}
  }

  return { skipped: false, added };
}
