// Per-visitor limits. Uses Upstash/Vercel KV when configured (strong), otherwise an in-memory fallback (best effort, per server instance).
const mem = new Map();
export async function rateLimit(req, name, perMinute, perDay) {
  const ip = String(req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "unknown").split(",")[0].trim();
  const now = Date.now();
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (url && token) {
    const minute = Math.floor(now / 60000), day = Math.floor(now / 86400000);
    const kMin = `rl:${name}:${ip}:m:${minute}`, kDay = `rl:${name}:${ip}:d:${day}`;
    try {
      const r = await fetch(`${url}/pipeline`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify([["INCR", kMin], ["EXPIRE", kMin, "90"], ["INCR", kDay], ["EXPIRE", kDay, "90000"]]) });
      if (!r.ok) throw new Error("Upstash status " + r.status);
      const out = await r.json();
      if (out[0].result > perMinute) return { ok: false, retryAfter: 60 - Math.floor(now / 1000) % 60 };
      if (out[2].result > perDay) return { ok: false, retryAfter: 86400 - Math.floor(now / 1000) % 86400 };
      return { ok: true };
    } catch (e) { console.error("Rate limit error:", e.message); }
  }
  const k = name + ":" + ip;
  let e = mem.get(k);
  if (!e || now - e.day > 86400000) e = { day: now, min: now, m: 0, d: 0 };
  if (now - e.min > 60000) { e.min = now; e.m = 0; }
  e.m++; e.d++; mem.set(k, e);
  if (mem.size > 5000) mem.clear();
  if (e.m > perMinute) return { ok: false, retryAfter: Math.ceil((60000 - (now - e.min)) / 1000) };
  if (e.d > perDay) return { ok: false, retryAfter: Math.ceil((86400000 - (now - e.day)) / 1000) };
  return { ok: true };
}
