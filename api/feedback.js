import { rateLimit } from "../ratelimit.js";
import { hasSupabase, saveSupabaseFeedback, listSupabaseFeedback } from "../supabase-feedback.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!hasSupabase()) return res.status(503).json({ error: "Supabase storage is not connected. Check SUPABASE_URL and SUPABASE_SECRET_KEY in Vercel." });
  if (req.method === "GET") {
    try { return res.status(200).json(await listSupabaseFeedback(100)); }
    catch (e) { return res.status(502).json({ error: e.message || "Could not load feedback." }); }
  }
  if (req.method !== "POST") { res.setHeader("Allow", "GET, POST"); return res.status(405).json({ error: "Only GET and POST requests are allowed." }); }
  const lim = await rateLimit(req, "feedback", 3, 10);
  if (!lim.ok) return res.status(429).json({ error: "Bahut saare feedback ho gaye. Thodi der baad phir try karo 💜" });
  const b = req.body || {}, rating = Number(b.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ error: "Please choose 1 to 5 stars." });
  const name = String(b.name || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 60);
  const instagram = String(b.instagram || "").replace(/^@/, "").replace(/[^a-zA-Z0-9._]/g, "").slice(0, 30);
  const message = String(b.message || "").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ").trim().slice(0, 500);
  if (!name) return res.status(400).json({ error: "Apna naam likho." });
  if (!message) return res.status(400).json({ error: "Feedback likho." });
  try { await saveSupabaseFeedback(rating, name, instagram, message); return res.status(200).json({ ok: true }); }
  catch (e) { return res.status(502).json({ error: e.message || "Could not save feedback." }); }
}
