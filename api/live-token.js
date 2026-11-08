
// Rate limit: counts requests per visitor IP with Upstash Redis (REST API). If Upstash is not configured, it logs a warning and lets requests through.
async function rateLimit(req, name, perMinute, perDay) {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) { console.warn("Rate limit skipped: Upstash is not configured."); return { ok: true }; }
  const ip = String(req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "unknown").split(",")[0].trim();
  const now = Date.now(), minute = Math.floor(now / 60000), day = Math.floor(now / 86400000);
  const kMin = `rl:${name}:${ip}:m:${minute}`, kDay = `rl:${name}:${ip}:d:${day}`;
  try {
    const r = await fetch(`${url}/pipeline`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify([["INCR", kMin], ["EXPIRE", kMin, "90"], ["INCR", kDay], ["EXPIRE", kDay, "90000"]]) });
    if (!r.ok) throw new Error("Upstash status " + r.status);
    const out = await r.json();
    if (out[0].result > perMinute) return { ok: false, retryAfter: 60 - Math.floor(now / 1000) % 60 };
    if (out[2].result > perDay) return { ok: false, retryAfter: 86400 - Math.floor(now / 1000) % 86400 };
    return { ok: true };
  } catch (e) { console.error("Rate limit error:", e.message); return { ok: true }; }
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const limit = await rateLimit(req, "voice", 2, 10);
  if (!limit.ok) {
    res.setHeader("Retry-After", String(limit.retryAfter));
    return res.status(429).json({ error: "Too many voice sessions. Please try again later." });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(503).json({
      error: "Gemini API key is not configured."
    });
  }

  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1alpha/auth_tokens",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          uses: 1,
          expireTime: new Date(
            Date.now() + 30 * 60 * 1000
          ).toISOString(),
          newSessionExpireTime: new Date(
            Date.now() + 60 * 1000
          ).toISOString()
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Token creation failed:", data);
      return res.status(502).json({
        error: "Could not create voice session token."
      });
    }

    return res.status(200).json({
      token: data.name
    });
  } catch (error) {
    console.error("Voice token error:", error);
    return res.status(502).json({
      error: "Voice assistant temporarily unavailable."
    });
  }
}
