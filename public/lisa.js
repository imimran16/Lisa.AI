const $ = id => document.getElementById(id);
const chat = $("chat"), app = document.querySelector(".app"), input = $("input");
let history = [], busy = false, speaking = false, active = false, running = false, rec = null, timer = null;

function bubble(text, who) {
  const d = document.createElement("div");
  d.className = "bubble " + who;
  d.textContent = text;
  chat.appendChild(d);
  chat.scrollTop = chat.scrollHeight;
  return d;
}
function setStatus(t) { $("voice-status").textContent = t; }

/* ---------- Voice output ---------- */
function speak(text) {
  if (!("speechSynthesis" in window)) { speaking = false; startRec(); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "hi-IN"; u.rate = 0.95; u.pitch = 1.05;
  const done = () => { speaking = false; app.classList.remove("speaking"); if (active) { setStatus("अब बोलिए…"); startRec(); } };
  u.onstart = () => { speaking = true; app.classList.add("speaking"); };
  u.onend = done; u.onerror = done;
  speaking = true;
  speechSynthesis.speak(u);
}

/* ---------- Ask AI ---------- */
async function ask(text) {
  text = (text || "").trim();
  if (!text || busy) return;
  bubble(text, "user");
  history.push({ role: "user", text });
  busy = true;
  try { rec?.stop(); } catch {}
  const typing = bubble("Lisa सोच रही है…", "lisa typing");
  setStatus("Lisa जवाब तैयार कर रही है…");
  try {
    const r = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, history: history.slice(-10) })
    });
    const d = await r.json().catch(() => ({ error: "Server ने valid जवाब नहीं भेजा (API route जाँचें)" }));
    if (!r.ok) throw new Error(d.error || "HTTP " + r.status);
    if (!d.reply) throw new Error("AI का जवाब खाली आया");
    typing.remove();
    history.push({ role: "model", text: d.reply });
    bubble(d.reply, "lisa");
    busy = false;
    if (active) { setStatus("Lisa बोल रही है…"); speak(d.reply); } else setStatus("लिखकर या 🎙️ दबाकर Lisa से बात करें");
  } catch (e) {
    typing.remove();
    history.pop();
    bubble("⚠️ " + e.message, "lisa error");
    setStatus("Error: " + e.message);
    busy = false;
    if (active) startRec();
  }
}

/* ---------- Voice input ---------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
function createRec() {
  if (!SR) return null;
  const r = new SR();
  r.lang = "hi-IN"; r.continuous = false; r.interimResults = false; r.maxAlternatives = 1;
  r.onstart = () => { running = true; app.classList.add("listening"); setStatus("🎙️ सुन रही हूँ… बोलिए"); };
  r.onresult = e => { const t = e.results[0]?.[0]?.transcript?.trim(); if (t) ask(t); };
  r.onerror = e => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      active = false; app.classList.remove("voice");
      setStatus("Mic permission दें: Chrome → Site settings → Microphone → Allow");
    } else if (e.error === "network") setStatus("Speech recognition network error — इंटरनेट जाँचें");
    else if (e.error !== "no-speech" && e.error !== "aborted") setStatus("Mic error: " + e.error);
  };
  r.onend = () => {
    running = false; app.classList.remove("listening");
    if (active && !busy && !speaking) { clearTimeout(timer); timer = setTimeout(startRec, 400); }
  };
  return r;
}
function startRec() {
  if (!active || running || busy || speaking || !rec) return;
  try { rec.start(); } catch {}
}
rec = createRec();

$("mic").onclick = () => {
  if (!SR) { setStatus("इस browser में voice input नहीं है — Android Chrome में खोलें"); return; }
  if (active) { stopVoice(); return; }
  active = true; app.classList.add("voice");
  startRec();
};
function stopVoice() {
  active = false; clearTimeout(timer);
  try { rec?.stop(); } catch {}
  speechSynthesis?.cancel();
  speaking = false;
  app.classList.remove("speaking", "listening", "voice");
  setStatus("Voice बंद है — लिख सकते हैं");
}
$("stop").onclick = stopVoice;

/* ---------- Text input ---------- */
$("composer").onsubmit = e => { e.preventDefault(); const t = input.value; input.value = ""; ask(t); };

$("clear").onclick = () => {
  history = [];
  chat.innerHTML = '<div class="bubble lisa">नमस्ते! बताइए, मैं आपकी क्या मदद करूँ?</div>';
  speechSynthesis?.cancel();
  setStatus("Chat साफ़ है");
};
window.addEventListener("pagehide", () => { active = false; try { rec?.stop(); } catch {} speechSynthesis?.cancel(); });
