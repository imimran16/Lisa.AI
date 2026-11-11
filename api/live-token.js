import { rateLimit } from "../ratelimit.js";
import { track } from "../stats.js";

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

    await track("voice");
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
