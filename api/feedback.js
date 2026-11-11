import { rateLimit } from "../ratelimit.js";
import { hasStore, saveFeedback } from "../stats.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Only POST requests are allowed." }); }
  const lim = await rateLimit(req, "feedback", 3, 10);
  if (!lim.ok) return res.status(429).json({ error: "Bahut saare feedback ho gaye. Thodi der baad phir try karo \ud83d\udc9c" });
  if (!hasStore()) return res.status(503).json({ error: "Feedback storage is not connected." });
  const b = req.body || {}, rating = Number(b.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ error: "Please choose 1 to 5 stars." });
  const message = String(b.message || "").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ").trim().slice(0, 500);
  try { await saveFeedback(rating, message); return res.status(200).json({ ok: true }); }
  catch { return res.status(502).json({ error: "Could not save feedback right now." }); }
}
