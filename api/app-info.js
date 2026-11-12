import { hasSupabase, getPublicAppInfo } from "../supabase-feedback.js";
export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  if(req.method!=="GET") return res.status(405).json({error:"GET only"});
  if(!hasSupabase()) return res.status(503).json({error:"Storage is not connected."});
  try{return res.status(200).json(await getPublicAppInfo());}
  catch(e){return res.status(502).json({error:e.message||"Could not load app info."});}
}
