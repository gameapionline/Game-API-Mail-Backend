import {Router} from "express";
import {requireAuth} from "../auth.js";
import {pushIsConfigured,savePushSubscription,removePushSubscription} from "../push.js";
import {config} from "../config.js";
export const pushRouter=Router();
pushRouter.use(requireAuth);
pushRouter.get("/push/public-key",(req,res)=>{if(!pushIsConfigured())return res.status(503).json({error:"Push notifications are not configured.",code:"PUSH_NOT_CONFIGURED"});res.json({publicKey:config.push.publicKey});});
pushRouter.post("/push/subscribe",async(req,res,next)=>{try{await savePushSubscription(req.user.id,req.body?.subscription,req.headers["user-agent"]||"");res.json({ok:true});}catch(e){next(e);}});
pushRouter.delete("/push/subscribe",async(req,res,next)=>{try{const endpoint=String(req.body?.endpoint||"");if(!endpoint)return res.status(400).json({error:"Endpoint is required."});await removePushSubscription(req.user.id,endpoint);res.json({ok:true});}catch(e){next(e);}});
