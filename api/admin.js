import { timingSafeEqual } from "node:crypto";
import { hasStore, getStats } from "../stats.js";
import { hasSupabase, listSupabaseFeedback, deleteSupabaseFeedback, listPushSubscriptions, getAppSettings, setAppSetting, getDownloadCount } from "../supabase-feedback.js";
import webpush from "web-push";

const DIR = "photos/lisa-gallery";
const API = process.env.GITHUB_API_URL || "https://api.github.com";
const IMG = /\.(jpe?g|png|webp|avif|gif)$/i;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const same = (a, b) => {
  const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || ""));
  return x.length === y.length && timingSafeEqual(x, y);
};
const kind = b =>
  b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff ? "jpg" :
  b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) ? "png" :
  b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP" ? "webp" : null;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Only POST requests are allowed." });
  }
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return res.status(500).json({ error: "ADMIN_PASSWORD is not set in Vercel." });
  if (!same(req.headers["x-admin-password"], pw)) { await sleep(800); return res.status(401).json({ error: "Wrong password." }); }
  const b0 = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  if (b0.action === "ping") return res.status(200).json({ ok: true });
  if (["push-send","download-settings","download-settings-save"].includes(b0.action) && !hasSupabase())
    return res.status(503).json({error:"Supabase is not connected."});
  if (b0.action === "download-settings") {
    try {
      const [actual, settings, feedback] = await Promise.all([getDownloadCount(), getAppSettings(), listSupabaseFeedback(1000)]);
      const items=feedback.items||[], avg=items.length?Math.round(items.reduce((a,x)=>a+Number(x.rating||0),0)/items.length*10)/10:0;
      return res.status(200).json({actualDownloads:actual,displayDownloads:Number(settings.display_download_count ?? actual),rating:avg,reviewCount:items.length});
    } catch(e){return res.status(502).json({error:e.message});}
  }
  if (b0.action === "download-settings-save") {
    const n=Number(b0.displayDownloads);
    if(!Number.isSafeInteger(n)||n<0||n>1000000000) return res.status(400).json({error:"Enter a valid non-negative download number."});
    try{await setAppSetting("display_download_count",n);return res.status(200).json({ok:true,displayDownloads:n});}
    catch(e){return res.status(502).json({error:e.message});}
  }
  if (b0.action === "push-send") {
    const {VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY}=process.env;
    if(!VAPID_PUBLIC_KEY||!VAPID_PRIVATE_KEY) return res.status(503).json({error:"VAPID keys are not configured in Vercel."});
    const title=String(b0.title||"Lisa AI").trim().slice(0,60), message=String(b0.message||"").trim().slice(0,180), url=String(b0.url||"/").trim();
    if(!message) return res.status(400).json({error:"Write a notification message."});
    if(!url.startsWith("/")&&!url.startsWith("https://lisaai-bay.vercel.app")) return res.status(400).json({error:"Use a Lisa AI website link."});
    try{
      webpush.setVapidDetails(process.env.VAPID_SUBJECT||"mailto:admin@lisaai-bay.vercel.app",VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY);
      const subs=await listPushSubscriptions();let sent=0,failed=0;
      const payload=JSON.stringify({title,body:message,url});
      for(const s of subs){
        try{await webpush.sendNotification({endpoint:s.endpoint,keys:{p256dh:s.p256dh,auth:s.auth}},payload);sent++;}
        catch(e){failed++;if(e.statusCode===404||e.statusCode===410){try{const {deletePushSubscription}=await import("../supabase-feedback.js");await deletePushSubscription(s.endpoint)}catch{}}}
      }
      return res.status(200).json({ok:true,sent,failed,total:subs.length});
    }catch(e){return res.status(502).json({error:"Notification send failed: "+e.message});}
  }
  if (b0.action === "feedback-delete") {
    if (!hasSupabase()) return res.status(503).json({ error: "Supabase storage is not connected. Check Vercel environment variables." });
    const id = String(b0.id || "");
    if (!id || id.length > 80) return res.status(400).json({ error: "Invalid feedback ID." });
    try { const deleted = await deleteSupabaseFeedback(id); return deleted ? res.status(200).json({ok:true}) : res.status(404).json({error:"Feedback not found."}); }
    catch (e) { return res.status(502).json({error:"Could not delete feedback: "+e.message}); }
  }
  if (b0.action === "feedback") {
    if (!hasSupabase()) return res.status(503).json({ error: "Supabase storage is not connected. Check Vercel environment variables." });
    try { return res.status(200).json(await listSupabaseFeedback(100)); }
    catch (e) { return res.status(502).json({ error: "Could not read feedback: " + e.message }); }
  }
  if (b0.action === "stats") {
    if (!hasStore()) return res.status(503).json({ error: "Visitor analytics storage is not connected. Feedback storage works separately through Supabase." });
    try { return res.status(200).json(await getStats(14)); }
    catch (e) { return res.status(502).json({ error: "Could not read data: " + e.message }); }
  }
  const missing = ["GITHUB_TOKEN", "GITHUB_REPO"].filter(k => !process.env[k]);
  if (missing.length) return res.status(500).json({ error: missing.join(" and ") + " not set in Vercel. See README (Gallery & Admin), then Redeploy." });

  const { GITHUB_TOKEN: token, GITHUB_REPO: repo } = process.env;
  const gh = (p, o = {}) => fetch(`${API}/repos/${repo}${p}`, {
    ...o,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "lisa-admin", "Content-Type": "application/json" }
  });
  const fail = async r => {
    const j = await r.json().catch(() => ({}));
    throw new Error(r.status === 401 || r.status === 403 ? "GitHub rejected the token. It needs Contents: Read and write access to this repo."
      : r.status === 404 ? "GitHub repo or file not found. Check GITHUB_REPO (owner/repo) and that the token can access it."
      : j.message || "GitHub error " + r.status);
  };
  const body = b0;
  try {
    let branch = process.env.GITHUB_BRANCH;
    if (!branch) { const r = await gh(""); if (!r.ok) await fail(r); branch = (await r.json()).default_branch; }
    const ref = encodeURIComponent(branch);

    if (body.action === "list") {
      const r = await gh(`/contents/${DIR}?ref=${ref}`);
      if (r.status === 404) return res.status(200).json({ photos: [] });
      if (!r.ok) await fail(r);
      const items = (await r.json()).filter(f => f.type === "file" && IMG.test(f.name) && !f.name.startsWith("."));
      return res.status(200).json({ photos: items.map(f => ({ name: f.name, url: `/${DIR}/${encodeURIComponent(f.name)}` })) });
    }
    if (body.action === "upload") {
      const m = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(body.data || "");
      if (!m) return res.status(400).json({ error: "Only JPG, PNG or WebP images are allowed." });
      const buf = Buffer.from(m[1], "base64"), ext = kind(buf);
      if (!ext) return res.status(400).json({ error: "This file is not a valid image." });
      if (buf.length > 4 * 1024 * 1024) return res.status(413).json({ error: "Image is too large (max 4 MB)." });
      const name = `lisa-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
      const r = await gh(`/contents/${DIR}/${name}`, { method: "PUT", body: JSON.stringify({ message: `Add Lisa photo ${name}`, content: m[1], branch }) });
      if (!r.ok) await fail(r);
      return res.status(200).json({ name, url: `/${DIR}/${name}` });
    }
    if (body.action === "delete") {
      const name = String(body.name || "");
      if (!name || /[\/\\]/.test(name) || name.startsWith(".")) return res.status(400).json({ error: "Invalid photo name." });
      const p = `/contents/${DIR}/${encodeURIComponent(name)}`;
      const g = await gh(`${p}?ref=${ref}`); if (!g.ok) await fail(g);
      const d = await gh(p, { method: "DELETE", body: JSON.stringify({ message: `Remove Lisa photo ${name}`, sha: (await g.json()).sha, branch }) });
      if (!d.ok) await fail(d);
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: "Unknown action." });
  } catch (e) {
    return res.status(502).json({ error: e.message || "Server error." });
  }
}
