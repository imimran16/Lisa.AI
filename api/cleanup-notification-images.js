export default async function handler(req,res){
  if(req.method!=="GET"&&req.method!=="POST") return res.status(405).json({error:"Method not allowed"});
  const secret=process.env.CRON_SECRET;
  if(!secret||req.headers.authorization!==`Bearer ${secret}`) return res.status(401).json({error:"Unauthorized"});
  const base=(process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL||"").replace(/\/+$/,"");
  const key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_SERVICE_KEY||"";
  if(!base||!key) return res.status(503).json({error:"Supabase credentials missing"});
  const headers={apikey:key,Authorization:`Bearer ${key}`,"Content-Type":"application/json"};
  try{
    const list=await fetch(`${base}/storage/v1/object/list/lisa-temp-notifications`,{method:"POST",headers,body:JSON.stringify({prefix:"",limit:1000,offset:0,sortBy:{column:"created_at",order:"asc"}})});
    if(!list.ok) throw new Error((await list.text()).slice(0,250));
    const files=await list.json(),cutoff=Date.now()-24*60*60*1000;
    const expired=files.filter(f=>f.name&&new Date(f.created_at||f.updated_at||0).getTime()<cutoff).map(f=>({name:f.name}));
    if(expired.length){const del=await fetch(`${base}/storage/v1/object/lisa-temp-notifications`,{method:"DELETE",headers,body:JSON.stringify({prefix:"",objects:expired.map(x=>x.name)})});if(!del.ok)throw new Error((await del.text()).slice(0,250));}
    return res.status(200).json({ok:true,deleted:expired.length});
  }catch(e){return res.status(502).json({error:"Cleanup failed: "+e.message});}
}
