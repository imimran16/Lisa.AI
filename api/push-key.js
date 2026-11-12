export default function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  if(req.method!=="GET") return res.status(405).json({error:"GET only"});
  const key=process.env.VAPID_PUBLIC_KEY;
  if(!key) return res.status(503).json({error:"Push notifications are not configured yet."});
  return res.status(200).json({publicKey:key});
}
