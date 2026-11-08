(() => {
  "use strict";

  const button = document.getElementById("voiceButton");
  const buttonLabel = document.getElementById("buttonLabel");
  const statusLine = document.getElementById("statusLine");
  const statusDetail = document.getElementById("statusDetail");
  const micToggle = document.getElementById("micToggle");
  const micToggleLabel = document.getElementById("micToggleLabel");
  const micToggleIcon = document.getElementById("micToggleIcon");

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const synth = window.speechSynthesis;

  let recognition = null;
  let sessionOn = false;
  let micMuted = false;
  let listening = false;
  let speaking = false;
  let busy = false;
  let restarting = false;
  let lastAssistantText = "";
  let voices = [];
  let history = [];
  let silenceTimer = null;
  let pendingTranscript = "";
  let lastProcessedTranscript = "";

  const MAX_HISTORY_MESSAGES = 12;

  function setStatus(state, title, detail) {
    document.body.dataset.state = state;
    statusLine.textContent = title.toUpperCase();
    statusDetail.textContent = detail || "Hindi · Hinglish · English";
    button.classList.toggle("active", sessionOn);
    buttonLabel.textContent = sessionOn ? "TAP TO STOP" : "TAP TO SPEAK";
    button.setAttribute("aria-label", sessionOn ? "Stop Lisa assistant" : "Start Lisa assistant");
    if (micToggle) {
      micToggle.hidden = !sessionOn;
      micToggle.setAttribute("aria-pressed", String(micMuted));
      micToggle.setAttribute("aria-label", micMuted ? "Turn microphone on" : "Turn microphone off");
      micToggleLabel.textContent = micMuted ? "MIC OFF" : "MIC ON";
      micToggleIcon.textContent = micMuted ? "🔇" : "🎙";
    }
  }

  function showError(message) {
    setStatus("error", "Something went wrong", message);
  }

  function loadVoices() {
    voices = synth ? synth.getVoices() : [];
  }
  if (synth) {
    loadVoices();
    synth.onvoiceschanged = loadVoices;
  }

  function chooseHindiVoice() {
    loadVoices();
    const hindi = voices.filter(v => /^hi(-|_)?/i.test(v.lang));
    const femaleNames = /(female|woman|heera|kalpana|aarti|priya|swara|aditi|kavya|isha|neerja)/i;
    const qualityHints = /(google|microsoft|neural|natural|online)/i;
    // Prefer clearly feminine Hindi voices; browser voice availability varies by device.
    return hindi.find(v => femaleNames.test(v.name) && qualityHints.test(v.name)) ||
      hindi.find(v => femaleNames.test(v.name)) ||
      voices.find(v => femaleNames.test(v.name) && /^hi/i.test(v.lang)) ||
      hindi.find(v => qualityHints.test(v.name)) ||
      hindi.find(v => /india/i.test(v.lang)) ||
      voices.find(v => /^en-IN/i.test(v.lang)) ||
      voices.find(v => /^hi/i.test(v.lang)) ||
      voices.find(v => /^en/i.test(v.lang)) || null;
  }

  function speak(text, onDone) {
    if (!synth || !("SpeechSynthesisUtterance" in window)) {
      showError("इस browser में voice playback उपलब्ध नहीं है। Chrome में खोलकर देखें।");
      return;
    }
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = chooseHindiVoice();
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = "hi-IN";
    }
    utterance.rate = 0.91;
    utterance.pitch = 1.18;
    utterance.volume = 1;
    speaking = true;
    setStatus("speaking", "Lisa is speaking…", "आपकी Lisa जवाब दे रही है");
    utterance.onend = () => {
      speaking = false;
      if (typeof onDone === "function" && sessionOn) onDone();
    };
    utterance.onerror = (event) => {
      speaking = false;
      if (sessionOn && event.error !== "canceled" && event.error !== "interrupted") {
        showError("Voice playback में समस्या आई। दोबारा कोशिश करें।");
      }
    };
    synth.speak(utterance);
    // Keep recognition available during playback so the user can interrupt Lisa.
    // The result handler filters likely self-transcription of Lisa's own speech.
    startListening();
  }

  function createRecognition() {
    if (!SpeechRecognition) return null;
    const rec = new SpeechRecognition();
    rec.lang = "hi-IN";
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      listening = true;
      restarting = false;
      if (!speaking && !busy) {
        setStatus("listening", "I'm listening…", "बोलिए, मैं सुन रही हूँ");
      }
    };

    rec.onresult = (event) => {
      let interim = "";
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript.trim();
        if (event.results[i].isFinal) finalText += " " + transcript;
        else interim += " " + transcript;
      }

      const heard = (finalText || interim).trim();
      if (!heard || busy) return;

      // Ignore likely recognition of Lisa's own voice to reduce speaker echo.
      if (speaking) {
        const normalizedHeard = normalize(heard);
        const normalizedLisa = normalize(lastAssistantText);
        if (normalizedLisa && normalizedHeard.length > 5 &&
            (normalizedLisa.includes(normalizedHeard) ||
             normalizedHeard.includes(normalizedLisa.slice(0, Math.min(24, normalizedLisa.length))))) {
          return;
        }
        if (heard.length >= 3) {
          synth.cancel();
          speaking = false;
          setStatus("listening", "हाँ, बोलिए…", "मैं आपकी बात सुन रही हूँ");
        }
      }

      pendingTranscript = heard;
      clearTimeout(silenceTimer);
      // Interim speech is sent after a brief pause; final results are sent sooner.
      const waitMs = finalText.trim() ? 180 : 650;
      silenceTimer = setTimeout(() => {
        const textToSend = pendingTranscript.trim();
        pendingTranscript = "";
        if (!sessionOn || micMuted || busy || !textToSend) return;
        const normalized = normalize(textToSend);
        if (normalized && normalized === lastProcessedTranscript) return;
        lastProcessedTranscript = normalized;
        processUserSpeech(textToSend);
      }, waitMs);
    };

    rec.onerror = (event) => {
      listening = false;
      if (!sessionOn) return;
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        sessionOn = false;
        showError("Microphone permission नहीं मिली। Browser settings में Microphone allow करें।");
        return;
      }
      if (event.error === "audio-capture") {
        sessionOn = false;
        showError("Microphone नहीं मिला। अपने device का microphone check करें।");
        return;
      }
      if (event.error === "network") {
        setStatus("error", "Network issue", "Speech recognition के लिए internet connection check करें।");
      }
    };

    rec.onend = () => {
      listening = false;
      if (sessionOn && !micMuted && !busy && !restarting) {
        restarting = true;
        setTimeout(() => {
          if (sessionOn && !micMuted && !busy) startListening();
        }, 350);
      }
    };
    return rec;
  }

  function normalize(text) {
    return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  }

  function startListening() {
    if (!sessionOn || micMuted || busy || listening) return;
    if (!recognition) recognition = createRecognition();
    if (!recognition) {
      sessionOn = false;
      showError("आपका browser Speech Recognition support नहीं करता। Android पर Chrome का latest version इस्तेमाल करें।");
      return;
    }
    try {
      recognition.start();
    } catch (error) {
      // InvalidStateError means recognition is already starting/running.
      if (error.name !== "InvalidStateError") {
        showError("Microphone शुरू नहीं हो पाया: " + error.message);
      }
    }
  }

  function stopListening() {
    if (recognition && listening) {
      try { recognition.stop(); } catch (_) {}
    }
    listening = false;
  }

  async function processUserSpeech(text) {
    if (!sessionOn || micMuted || busy || !text) return;
    busy = true;
    stopListening();
    if (speaking) {
      synth.cancel();
      speaking = false;
    }
    setStatus("thinking", "Lisa is thinking…", "आपकी बात समझ रही हूँ");

    history.push({ role: "user", parts: [{ text }] });
    history = history.slice(-MAX_HISTORY_MESSAGES);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: history })
      });

      let data;
      try { data = await response.json(); }
      catch (_) { throw new Error("Server से सही response नहीं मिला।"); }

      if (!response.ok) {
        throw new Error(data.error || `Server error (${response.status})`);
      }
      if (!data.reply || typeof data.reply !== "string") {
        throw new Error("Gemini ने खाली जवाब दिया। फिर से पूछें।");
      }

      const reply = data.reply.trim();
      history.push({ role: "model", parts: [{ text: reply }] });
      history = history.slice(-MAX_HISTORY_MESSAGES);
      lastAssistantText = reply;
      busy = false;
      speak(reply, () => {
        if (sessionOn) {
          setStatus("listening", "I'm listening…", "आप अगला सवाल पूछ सकते हैं");
          startListening();
        }
      });
    } catch (error) {
      busy = false;
      showError(error.message || "AI response लेने में समस्या आई।");
      // Keep session active so the user can retry by speaking again.
      setTimeout(() => {
        if (sessionOn) startListening();
      }, 1200);
    }
  }

  async function startSession() {
    if (!SpeechRecognition) {
      showError("इस browser में speech recognition support नहीं है। Android Chrome या desktop Chrome इस्तेमाल करें।");
      return;
    }
    if (!navigator.mediaDevices && !window.isSecureContext) {
      showError("Microphone के लिए HTTPS जरूरी है। Vercel का HTTPS URL खोलें।");
      return;
    }
    sessionOn = true;
    micMuted = false;
    history = [];
    pendingTranscript = "";
    lastProcessedTranscript = "";
    setStatus("speaking", "CONNECTING", "Lisa is getting ready to listen");
    // Ask for microphone permission before greeting, so permission errors are clear.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
    } catch (error) {
      sessionOn = false;
      showError(error.name === "NotAllowedError"
        ? "Microphone permission deny है। Browser settings में Allow करें।"
        : "Microphone access नहीं मिला। Device settings check करें।");
      return;
    }
    lastAssistantText = "Hello, मैं Lisa हूँ। आपकी AI Assistant। आप कैसे हैं?";
    speak(lastAssistantText, () => {
      startListening();
    });
  }

  function stopSession() {
    sessionOn = false;
    micMuted = false;
    busy = false;
    speaking = false;
    clearTimeout(silenceTimer);
    stopListening();
    if (synth) synth.cancel();
    history = [];
    pendingTranscript = "";
    lastProcessedTranscript = "";
    setStatus("idle", "Lisa is resting", "जब भी बात करनी हो, button दबाएँ");
    button.classList.remove("active");
    buttonLabel.textContent = "TAP TO SPEAK";
  }

  if (micToggle) {
    micToggle.addEventListener("click", () => {
      if (!sessionOn) return;
      micMuted = !micMuted;
      if (micMuted) {
        clearTimeout(silenceTimer);
        pendingTranscript = "";
        stopListening();
        setStatus("idle", "MICROPHONE OFF", "Lisa बोलना जारी रखेगी; mic बंद है");
      } else {
        setStatus("listening", "I'M LISTENING", "बोलिए, मैं सुन रही हूँ");
        startListening();
      }
    });
  }

  button.addEventListener("click", () => {
    if (sessionOn) stopSession();
    else startSession();
  });

  window.addEventListener("beforeunload", () => {
    sessionOn = false;
    if (recognition) {
      try { recognition.abort(); } catch (_) {}
    }
    if (synth) synth.cancel();
  });

  setStatus("idle", "Ready when you are", "Tap the button and say hello");
})();
