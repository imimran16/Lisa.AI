export default async function handler(req,res){
 if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({error:"POST only"});}
 try{
  const key=process.env.GEMINI_API_KEY;if(!key)return res.status(500).json({error:"Vercel Environment Variables में GEMINI_API_KEY सेट करें"});
  const msg=String(req.body?.message||"").slice(0,8000);if(!msg.trim())return res.status(400).json({error:"Message required"});
  const history=Array.isArray(req.body?.history)?req.body.history.slice(-10):[];
  const contents=history.map(x=>({role:x.role==="model"?"model":"user",parts:[{text:String(x.text||"").slice(0,8000)}]}));
  if(contents.at(-1)?.parts?.[0]?.text!==msg)contents.push({role:"user",parts:[{text:msg}]});
  const model=process.env.GEMINI_MODEL||"gemini-2.5-flash";
  const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":key},body:JSON.stringify({systemInstruction:{parts:[{text:"You are Lisa, a warm and helpful Hindi-speaking AI companion. Reply naturally in Hindi or Hinglish matching the user's language. Be concise, friendly, honest, and never claim to be human. Do not mention Gemini or the provider unless asked."}]},contents,generationConfig:{temperature:.8,maxOutputTokens:900}})});
  const data=await response.json();if(!response.ok)return res.status(response.status).json({error:data.error?.message||"Gemini API error"});
  const reply=data.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("").trim();if(!reply)return res.status(502).json({error:"Gemini returned empty response"});return res.status(200).json({reply});
 }catch(e){return res.status(500).json({error:e.message||"Server error"});}
}