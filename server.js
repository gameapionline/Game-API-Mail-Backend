import express from "express";
import cors from "cors";
import {config} from "./src/config.js";
import {supabaseAdmin} from "./src/supabase.js";
import {requireAuth} from "./src/auth.js";
import {getUserMailbox,ensureDefaultMailboxForUser} from "./src/mailbox.js";
import {syncMailbox} from "./src/mail/sync.js";
import {mailRouter} from "./src/routes/mail.js";
import {pushRouter} from "./src/routes/push.js";

const app=express();app.disable("x-powered-by");app.set("trust proxy",1);
const origins=new Set(config.frontendOrigins);
app.use(cors({origin(origin,cb){if(!origin||origins.size===0||origins.has(origin))return cb(null,true);cb(new Error("CORS origin not allowed."));},credentials:true}));
app.use(express.json({limit:"2mb"}));app.use(express.urlencoded({extended:false,limit:"2mb"}));
app.get("/",(req,res)=>res.json({name:"Game API Mail Backend",status:"online",version:"1.0.0"}));
app.get("/health",async(req,res)=>{const started=Date.now();const {error}=await supabaseAdmin.from("profiles").select("id").limit(1);res.status(error?503:200).json({ok:!error,service:"game-api-mail-backend",supabase:!error,latencyMs:Date.now()-started,time:new Date().toISOString()});});
app.get("/api/me",requireAuth,async(req,res,next)=>{try{const {data:profile,error}=await supabaseAdmin.from("profiles").select("*").eq("id",req.user.id).maybeSingle();if(error)throw error;const mailbox=(await getUserMailbox(req.user.id))||(await ensureDefaultMailboxForUser(req.user.id));res.json({user:{id:req.user.id,email:req.user.email},profile,mailbox:mailbox?{id:mailbox.id,email:mailbox.email_address,display_name:mailbox.display_name}:null});}catch(e){next(e);}});
app.use("/api",mailRouter);app.use("/api",pushRouter);
app.use((error,req,res,next)=>{console.error("API error:",error);const status=Number(error.status||500);if(error.message==="CORS origin not allowed.")return res.status(403).json({error:"Origin is not allowed.",code:"CORS_DENIED"});res.status(status).json({error:status>=500?"Internal server error.":String(error.message||"Request failed."),code:error.code||"REQUEST_FAILED"});});
const server=app.listen(config.port,()=>console.log("Game API Mail backend listening on port "+config.port));
let syncing=false;
async function backgroundSync(){if(syncing)return;syncing=true;try{const {data:mailboxes,error}=await supabaseAdmin.from("mailboxes").select("*").eq("is_active",true);if(error)throw error;for(const mailbox of mailboxes||[]){try{const r=await syncMailbox(mailbox);if(!r.skipped&&r.added)console.log("Synced "+r.added+" message(s) for "+mailbox.email_address);}catch(e){console.error("Sync failed for "+mailbox.email_address+":",e.message);}}}catch(e){console.error("Background sync error:",e.message);}finally{syncing=false;}}
if(config.syncIntervalMs>0){setTimeout(backgroundSync,5000);setInterval(backgroundSync,config.syncIntervalMs);}
process.on("SIGTERM",()=>server.close(()=>process.exit(0)));process.on("SIGINT",()=>server.close(()=>process.exit(0)));
