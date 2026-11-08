const SYSTEM = "You are Lisa, a warm and helpful Hindi-speaking AI companion. Reply naturally in Hindi or Hinglish, matching the user's language. Keep answers short (2-4 sentences), friendly and honest. Never claim to be human. Do not mention Gemini or the provider unless asked.";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "POST only" });
  }
  try {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return res.status(500).json({ error: "Vercel Environment Variables में GEMINI_API_KEY सेट करें" });

    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }

    const msg = String(body?.message || "").slice(0, 8000);
    if (!msg.trim()) return res.status(400).json({ error: "Message required" });

    // Gemini needs the conversation to start with a "user" turn
    let history = Array.isArray(body?.history) ? body.history.slice(-10) : [];
    while (history.length && history[0].role === "model") history.shift();
    const contents = history.map(x => ({
      role: x.role === "model" ? "model" : "user",
      parts: [{ text: String(x.text || "").slice(0, 8000) }]
    }));
    if (contents.at(-1)?.parts?.[0]?.text !== msg) contents.push({ role: "user", parts: [{ text: msg }] });

    // FIX: "gemini-3.8-flash" does not exist -> default to a real model
    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

    const generationConfig = { temperature: 0.8, maxOutputTokens: 1024 };
    // 2.5-flash "thinking" eats output tokens and can leave the reply empty
    if (/2\.5-flash/.test(model)) generationConfig.thinkingConfig = { thinkingBudget: 0 };

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents, generationConfig })
      }
    );
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.error?.message || "Gemini API error" });

    const reply = data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("").trim();
    if (!reply) {
      const why = data.promptFeedback?.blockReason || data.candidates?.[0]?.finishReason || "unknown";
      return res.status(502).json({ error: "Gemini ने खाली जवाब दिया (" + why + ")" });
    }
    return res.status(200).json({ reply });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
