import { supabaseAdmin } from "./supabase.js";
import { config } from "./config.js";
import { decryptSecret, encryptSecret, generateMailboxPassword } from "./crypto.js";

const SYSTEM_FOLDERS = [
  ["Inbox", "INBOX"],
  ["Starred", "STARRED"],
  ["Sent", "SENT"],
  ["Drafts", "DRAFTS"],
  ["Trash", "TRASH"]
];

function normalizeLocalPart(value) {
  return String(value || "").trim().toLowerCase().replace(/^@/, "").replace(/@.*$/, "");
}

function validLocalPart(value) {
  return /^(?=[a-z0-9])(?=.*[a-z0-9]$)[a-z0-9_-]+(?:\.[a-z0-9_-]+)*$/.test(value);
}

async function createFolders(mailboxId) {
  for (const [name, systemName] of SYSTEM_FOLDERS) {
    const { error } = await supabaseAdmin.from("folders").upsert(
      { mailbox_id: mailboxId, name, system_name: systemName },
      { onConflict: "mailbox_id,system_name" }
    );
    if (error && !String(error.message).toLowerCase().includes("unique")) throw error;
  }
}

async function getProfile(userId) {
  const { data, error } = await supabaseAdmin.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) throw error;
  return data;
}

async function getCredentials(mailboxId) {
  const { data, error } = await supabaseAdmin.schema("private").from("mailbox_credentials")
    .select("*").eq("mailbox_id", mailboxId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    email: data.email,
    password: decryptSecret({
      ciphertext: data.password_ciphertext,
      iv: data.password_iv,
      authTag: data.password_auth_tag
    }),
    hostingerMailboxId: data.hostinger_mailbox_id
  };
}

async function saveCredentials(mailboxId, email, password, hostingerMailboxId = null) {
  const encrypted = encryptSecret(password);
  const { error } = await supabaseAdmin.schema("private").from("mailbox_credentials").upsert(
    {
      mailbox_id: mailboxId,
      email,
      hostinger_mailbox_id: hostingerMailboxId,
      password_ciphertext: encrypted.ciphertext,
      password_iv: encrypted.iv,
      password_auth_tag: encrypted.authTag,
      updated_at: new Date().toISOString()
    },
    { onConflict: "mailbox_id" }
  );
  if (error) throw error;
}

async function hostingerCreateMailbox(localPart, password) {
  if (!config.hostingerApi.token || !config.hostingerApi.orderId) {
    throw new Error("Hostinger provisioning is not configured.");
  }

  const response = await fetch(
    config.hostingerApi.baseUrl + "/api/mail/v1/orders/" +
    encodeURIComponent(config.hostingerApi.orderId) + "/mailboxes",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + config.hostingerApi.token,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ local_part: localPart, password })
    }
  );

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error || "Hostinger mailbox creation failed.");
    error.status = response.status;
    throw error;
  }
  return body?.data || body;
}

export async function getUserMailbox(userId) {
  const { data, error } = await supabaseAdmin.from("mailboxes").select("*")
    .eq("owner_id", userId).eq("is_active", true).order("created_at", { ascending: true })
    .limit(1).maybeSingle();

  if (error) throw error;
  if (data) {
    await createFolders(data.id);
    return data;
  }

  const profile = await getProfile(userId);
  const localPart = normalizeLocalPart(profile?.mail_username);
  if (!localPart) return null;

  const email = localPart + "@" + config.mailDomain;
  const { data: existing, error: existingError } = await supabaseAdmin.from("mailboxes")
    .select("*").eq("email_address", email).maybeSingle();
  if (existingError) throw existingError;
  if (existing && existing.owner_id !== userId) {
    const err = new Error("That Game API Mail address is already in use.");
    err.status = 409;
    throw err;
  }
  if (existing) {
    await createFolders(existing.id);
    return existing;
  }

  const { data: mailbox, error: insertError } = await supabaseAdmin.from("mailboxes").insert({
    owner_id: userId,
    email_address: email,
    display_name: profile?.display_name ||
      [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Game API Mail",
    provider: "hostinger"
  }).select("*").single();

  if (insertError) throw insertError;
  await createFolders(mailbox.id);
  return mailbox;
}

export async function provisionUserMailbox(userId) {
  const profile = await getProfile(userId);
  const localPart = normalizeLocalPart(profile?.mail_username);

  if (!localPart || !validLocalPart(localPart)) {
    const err = new Error("Choose a valid Game API Mail username first.");
    err.status = 400;
    throw err;
  }

  const email = localPart + "@" + config.mailDomain;
  const { data: existing } = await supabaseAdmin.from("mailboxes").select("*")
    .eq("email_address", email).maybeSingle();

  if (existing) {
    if (existing.owner_id !== userId) {
      const err = new Error("That email address is already registered.");
      err.status = 409;
      throw err;
    }
    return { mailbox: existing, created: false };
  }

  const password = generateMailboxPassword();
  const hostingerMailbox = await hostingerCreateMailbox(localPart, password);

  const { data: mailbox, error } = await supabaseAdmin.from("mailboxes").insert({
    owner_id: userId,
    email_address: email,
    display_name: profile?.display_name ||
      [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Game API Mail",
    provider: "hostinger",
    is_active: true
  }).select("*").single();

  if (error) throw error;
  await createFolders(mailbox.id);

  try {
    await saveCredentials(mailbox.id, email, password, hostingerMailbox?.id || hostingerMailbox?.resource_id || null);
  } catch (credentialError) {
    await supabaseAdmin.from("mailboxes").delete().eq("id", mailbox.id);
    throw credentialError;
  }

  return { mailbox, created: true };
}

export async function getMailboxCredentials(mailbox) {
  const stored = await getCredentials(mailbox.id);
  if (stored) return stored;

  if (config.defaultMailboxEmail === mailbox.email_address && config.defaultMailboxPassword) {
    return {
      email: config.defaultMailboxEmail,
      password: config.defaultMailboxPassword,
      hostingerMailboxId: null
    };
  }

  return null;
}

export async function ensureDefaultMailboxForUser(userId) {
  const existing = await getUserMailbox(userId);
  if (existing) return existing;
  if (!config.defaultMailboxEmail || !config.defaultMailboxPassword) return null;

  const { data: conflict } = await supabaseAdmin.from("mailboxes").select("*")
    .eq("email_address", config.defaultMailboxEmail).maybeSingle();

  if (conflict && conflict.owner_id !== userId) return null;
  if (conflict) {
    await createFolders(conflict.id);
    return conflict;
  }

  const { data: mailbox, error } = await supabaseAdmin.from("mailboxes").insert({
    owner_id: userId,
    email_address: config.defaultMailboxEmail,
    display_name: "Game API Mail",
    provider: "hostinger"
  }).select("*").single();

  if (error) throw error;
  await createFolders(mailbox.id);
  return mailbox;
}

export async function getFolderId(mailboxId, systemName) {
  const { data, error } = await supabaseAdmin.from("folders").select("id,name,system_name")
    .eq("mailbox_id", mailboxId).eq("system_name", systemName).maybeSingle();
  if (error) throw error;
  return data?.id || null;
}
