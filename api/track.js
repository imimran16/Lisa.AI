import { rateLimit } from "../ratelimit.js";
import { track } from "../stats.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ ok: false }); }
  const lim = await rateLimit(req, "track", 30, 400);
  if (!lim.ok) return res.status(429).json({ ok: false });
  const b = req.body || {};
  if (!["visit", "photo"].includes(b.e)) return res.status(400).json({ ok: false });
  await track(b.e, b.id);
  return res.status(200).json({ ok: true });
}
