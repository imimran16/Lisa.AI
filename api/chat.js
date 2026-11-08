export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Only POST requests are allowed." });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "Server configuration missing: GEMINI_API_KEY is not set in Vercel."
    });
  }

  try {
    const body = req.body || {};
    const incoming = Array.isArray(body.contents) ? body.contents : [];
    if (!incoming.length) {
      return res.status(400).json({ error: "Please say something first." });
    }

    // Accept only short text messages and valid Gemini roles.
    const contents = incoming.slice(-12).map((item) => {
      const role = item && item.role === "model" ? "model" : "user";
      const text = item && Array.isArray(item.parts)
        ? item.parts.map(part => typeof part.text === "string" ? part.text : "").join(" ").trim()
        : "";
      return { role, parts: [{ text: text.slice(0, 3000) }] };
    }).filter(item => item.parts[0].text);

    if (!contents.length || contents[contents.length - 1].role !== "user") {
      return res.status(400).json({ error: "Last message must be a user message." });
    }

    const model = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const geminiResponse = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{
            text: [
              "You are Lisa, a warm, intelligent, friendly female personal voice assistant.",
              "Understand Hindi, Hinglish, and English. Reply in the same language style the user uses.",
              "Be a fast voice assistant. Answer immediately and directly.",
              "Use at most 1 or 2 short sentences for ordinary questions, usually under 35 words.",
              "Do not explain your reasoning or say that you are thinking. Avoid long introductions.",
              "Reply in the same language style the user uses: Hindi, Hinglish, or English.",
              "Use natural spoken wording. No markdown, tables, headings, or emoji.",
              "If asked who you are, say you are Lisa, the user's AI assistant."
            ].join(" ")
          }]
        },
        contents,
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 100
        }
      })
    });

    const result = await geminiResponse.json();

    if (!geminiResponse.ok) {
      const message = result?.error?.message || `Gemini API returned ${geminiResponse.status}`;
      return res.status(geminiResponse.status >= 500 ? 502 : geminiResponse.status).json({
        error: `Gemini API error: ${message}`
      });
    }

    const reply = result?.candidates?.[0]?.content?.parts
      ?.map(part => typeof part.text === "string" ? part.text : "")
      .join(" ")
      .trim();

    if (!reply) {
      return res.status(502).json({
        error: "Gemini returned no text. The request may have been blocked or empty."
      });
    }

    return res.status(200).json({ reply });
  } catch (error) {
    console.error("Lisa API error:", error);
    return res.status(500).json({
      error: "Lisa server error. Please try again."
    });
  }
}
