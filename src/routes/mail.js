import {Router} from "express";
import {supabaseAdmin} from "../supabase.js";
import {requireAuth} from "../auth.js";
import {getUserMailbox,getFolderId,provisionUserMailbox,getMailboxCredentials} from "../mailbox.js";
import {createSmtpTransport} from "../mail/hostinger.js";
import {syncMailbox} from "../mail/sync.js";
export const mailRouter=Router();mailRouter.use(requireAuth);
const folderName=v=>{const a=new Set(["INBOX","STARRED","SENT","DRAFTS","TRASH"]);const x=String(v||"INBOX").toUpperCase();return a.has(x)?x:"INBOX";};

mailRouter.get("/mailbox",async(req,res,next)=>{try{const m=await getUserMailbox(req.user.id);if(!m)return res.status(404).json({error:"Your mailbox has not been provisioned yet.",code:"MAILBOX_NOT_PROVISIONED"});res.json({mailbox:{id:m.id,email:m.email_address,display_name:m.display_name,provider:m.provider}});}catch(e){next(e);}});
mailRouter.post("/mailbox/provision",async(req,res,next)=>{try{const r=await provisionUserMailbox(req.user.id);res.status(r.created?201:200).json({created:r.created,mailbox:{id:r.mailbox.id,email:r.mailbox.email_address,display_name:r.mailbox.display_name}});}catch(e){next(e);}});
mailRouter.post("/mail/sync",async(req,res,next)=>{try{const m=await getUserMailbox(req.user.id);if(!m)return res.status(404).json({error:"Mailbox not provisioned.",code:"MAILBOX_NOT_PROVISIONED"});res.json(await syncMailbox(m));}catch(e){next(e);}});

mailRouter.get("/mail",async(req,res,next)=>{try{
  const m=await getUserMailbox(req.user.id);if(!m)return res.json({messages:[],total:0});
  const folder=folderName(req.query.folder);if(folder==="INBOX"){try{await syncMailbox(m);}catch(e){console.warn("Inbox sync failed:",e.message);}}
  const limit=Math.min(Math.max(Number(req.query.limit||50),1),100),offset=Math.max(Number(req.query.offset||0),0);
  let q=supabaseAdmin.from("messages").select("id,mailbox_id,folder_id,sender_name,sender_email,subject,preview,received_at,sent_at,is_read,is_starred,is_important,has_attachments,created_at",{count:"exact"}).eq("mailbox_id",m.id);
  if(folder==="STARRED")q=q.eq("is_starred",true);else{const folderId=await getFolderId(m.id,folder);if(!folderId)return res.json({messages:[],total:0});q=q.eq("folder_id",folderId);}
  const {data,error,count}=await q.order("received_at",{ascending:false,nullsFirst:false}).range(offset,offset+limit-1);if(error)throw error;
  res.json({messages:(data||[]).map(x=>({...x,body_preview:x.preview})),total:count||0,folder,limit,offset});
}catch(e){next(e);}});

mailRouter.get("/mail/:id",async(req,res,next)=>{try{
  const m=await getUserMailbox(req.user.id);if(!m)return res.status(404).json({error:"Mailbox not found."});
  const {data,error}=await supabaseAdmin.from("messages").select("*").eq("id",req.params.id).eq("mailbox_id",m.id).maybeSingle();if(error)throw error;if(!data)return res.status(404).json({error:"Message not found."});
  await supabaseAdmin.from("messages").update({is_read:true,updated_at:new Date().toISOString()}).eq("id",data.id).eq("mailbox_id",m.id);
  const {data:recipients}=await supabaseAdmin.from("message_recipients").select("*").eq("message_id",data.id);
  const {data:attachments}=await supabaseAdmin.from("attachments").select("*").eq("message_id",data.id);
  res.json({message:{...data,recipients:recipients||[],attachments:attachments||[]}});
}catch(e){next(e);}});

mailRouter.post("/mail/:action",async(req,res,next)=>{try{
  const action=String(req.params.action||"").toLowerCase(),ids=Array.isArray(req.body?.ids)?req.body.ids:[],m=await getUserMailbox(req.user.id);if(!m)return res.status(404).json({error:"Mailbox not found."});
  if(action==="star"){const id=req.body?.id;if(!id)return res.status(400).json({error:"Message id is required."});const {data,error}=await supabaseAdmin.from("messages").update({is_starred:Boolean(req.body?.is_starred),updated_at:new Date().toISOString()}).eq("id",id).eq("mailbox_id",m.id).select("id,is_starred").maybeSingle();if(error)throw error;return res.json({message:data});}
  if(!["read","delete"].includes(action))return res.status(400).json({error:"Unsupported mail action."});if(!ids.length)return res.status(400).json({error:"At least one message id is required."});
  if(action==="read"){const {error}=await supabaseAdmin.from("messages").update({is_read:true,updated_at:new Date().toISOString()}).in("id",ids).eq("mailbox_id",m.id);if(error)throw error;}
  else{const trash=await getFolderId(m.id,"TRASH");const {error}=await supabaseAdmin.from("messages").update({folder_id:trash,updated_at:new Date().toISOString()}).in("id",ids).eq("mailbox_id",m.id);if(error)throw error;}
  res.json({ok:true,action,count:ids.length});
}catch(e){next(e);}});

mailRouter.post("/mail/send",async(req,res,next)=>{try{
  const m=await getUserMailbox(req.user.id);if(!m)return res.status(409).json({error:"Provision your Game API Mail address before sending.",code:"MAILBOX_NOT_PROVISIONED"});
  const credentials=await getMailboxCredentials(m);if(!credentials)return res.status(409).json({error:"Mailbox sending credentials are not configured.",code:"MAILBOX_CREDENTIALS_NOT_CONFIGURED"});
  const to=String(req.body?.to||"").trim(),subject=String(req.body?.subject||"").trim(),body=String(req.body?.body||"");if(!to||!subject||!body)return res.status(400).json({error:"Recipient, subject and message are required."});
  const info=await createSmtpTransport(credentials).sendMail({from:{name:m.display_name||"Game API Mail",address:m.email_address},to,subject,text:body});
  const sent=await getFolderId(m.id,"SENT");const {data:message,error}=await supabaseAdmin.from("messages").insert({mailbox_id:m.id,folder_id:sent,message_id:info.messageId||null,sender_name:m.display_name,sender_email:m.email_address,subject,body_text:body,preview:body.replace(/\s+/g," ").trim().slice(0,300),sent_at:new Date().toISOString(),is_read:true}).select("*").single();if(error)throw error;
  await supabaseAdmin.from("message_recipients").insert({message_id:message.id,recipient_type:"to",email:to});
  res.status(201).json({ok:true,message:{id:message.id,messageId:info.messageId||null}});
}catch(e){next(e);}});
