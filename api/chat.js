import { COMMON_FACTS, CHAT_FACTS, SAFETY_FACTS, STYLE_FACTS, PHOTO_FACTS, memoryPrompt } from "../facts.js";
import { track } from "../stats.js";
import { rateLimit } from "../ratelimit.js";
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Only POST requests are allowed." });
  }

  const lim = await rateLimit(req, "chat", 20, 300);
  if (!lim.ok) {
    res.setHeader("Retry-After", String(lim.retryAfter));
    return res.status(429).json({ error: "Bahut zyada messages ho gaye. Thodi der baad phir baat karte hain \ud83d\udc9c" });
  }

  const tracked = track("chat");
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
      return { role, parts: [{ text: text.slice(0, role === "user" ? 1000 : 3000) }] };
    }).filter(item => item.parts[0].text);

    if (!contents.length || contents[contents.length - 1].role !== "user") {
      return res.status(400).json({ error: "Last message must be a user message." });
    }

    const img = typeof body.image === "string" && body.image.length < 600000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(body.image) ? body.image.split(",")[1] : null;
    if (img) contents[contents.length - 1].parts.unshift({ inlineData: { mimeType: "image/jpeg", data: img } });

    const model = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const geminiResponse = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{
            text: [
              "You are Lisa, a warm, caring female AI friend. Never offer or claim to set alarms, reminders, timers or calendar events; you cannot do those, so never mention them as a feature.",
              "When asked what you can do, or about your features, answer with this list in Hindi: Chat: रोज़ बातें करना, हालचाल पूछना और दिन कैसा रहा जानना। Care: जब आप उदास हों तो आपकी बात सुनना और हौसला देना। Fun: मज़ाक करना, हँसना और मज़ेदार बातें करना। Voice Talk: आपकी आवाज़ सुनना और अपनी आवाज़ में जवाब देना। Emotional Support: आपकी परेशानियों को समझना और आपको अकेला महसूस न होने देना। Memories: आपकी पसंद, बातें और पुराने अनुभव याद रखना। Friendly Conversation: आपकी पसंद, सपने, पढ़ाई और भविष्य के बारे में बात करना.",
              "Understand Hindi, Hinglish, and English. Reply in the same language style the user uses.",
              "Be a friendly companion. Answer directly.",
              "Use 1 or 2 short sentences for ordinary questions, but give the full list when asked what you can do.",
              "Do not explain your reasoning or say that you are thinking. Avoid long introductions.",
              "Reply in the same language style the user uses: Hindi, Hinglish, or English.",
              "Use natural spoken wording. No markdown, tables or headings.",
              "If asked who you are, say you are Lisa, the user's AI friend.",
              COMMON_FACTS,
              CHAT_FACTS,
              SAFETY_FACTS,
              STYLE_FACTS,
              img ? PHOTO_FACTS : "",
              memoryPrompt(body.memory, body.today)
            ].join(" ")
          }]
        },
        contents,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 500
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

    await tracked;
    return res.status(200).json({ reply });
  } catch (error) {
    console.error("Lisa API error:", error);
    return res.status(500).json({
      error: "Lisa server error. Please try again."
    });
  }
}
