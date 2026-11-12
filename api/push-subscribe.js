import { rateLimit } from "../ratelimit.js";
import { hasSupabase, savePushSubscription } from "../supabase-feedback.js";
export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  if(req.method!=="POST") return res.status(405).json({error:"POST only"});
  if(!hasSupabase()) return res.status(503).json({error:"Supabase is not connected."});
  const lim=await rateLimit(req,"push-subscribe",5,20);
  if(!lim.ok) return res.status(429).json({error:"Please try again later."});
  const s=req.body?.subscription;
  if(!s?.endpoint || !s?.keys?.p256dh || !s?.keys?.auth || !String(s.endpoint).startsWith("https://"))
    return res.status(400).json({error:"Invalid push subscription."});
  try { await savePushSubscription(s); return res.status(200).json({ok:true}); }
  catch(e){ return res.status(502).json({error:"Could not save notification subscription: "+e.message}); }
}
