import { GoogleGenAI, Modality } from "https://esm.sh/@google/genai";

const $ = id => document.getElementById(id);
const app = document.querySelector(".app");
const MODEL = "gemini-3.8-live";
const SYSTEM = `You are Lisa, a warm, sweet, helpful female voice assistant. Speak naturally in Hindi or Hinglish, matching the user's language. Keep replies concise and conversational. You are an AI assistant, never claim to be human. Reply with audio only.`;
let active = false, connecting = false, micMuted = false, session = null;
let stream = null, inputCtx = null, processor = null, source = null, outputCtx = null;
let nextPlayTime = 0, reconnectTimer = null, token = null;

function status(text) { $("voice-status").textContent = text; }
function b64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i=0;i<bytes.length;i+=chunk) binary += String.fromCharCode(...bytes.subarray(i, i+chunk));
  return btoa(binary);
}
function fromB64(s) {
  const raw = atob(s), out = new Uint8Array(raw.length);
  for (let i=0;i<raw.length;i++) out[i] = raw.charCodeAt(i);
  return out;
}
function pcm16Base64(float32) {
  const pcm = new Int16Array(float32.length);
  for (let i=0;i<float32.length;i++) {
    const v = Math.max(-1, Math.min(1, float32[i]));
    pcm[i] = v < 0 ? v * 32768 : v * 32767;
  }
  return b64(new Uint8Array(pcm.buffer));
}
function resample(input, fromRate, toRate) {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate, length = Math.floor(input.length / ratio);
  const out = new Float32Array(length);
  for (let i=0;i<length;i++) {
    const pos=i*ratio, idx=Math.floor(pos), frac=pos-idx;
    const a=input[idx] || 0, b=input[Math.min(idx+1,input.length-1)] || a;
    out[i]=a+(b-a)*frac;
  }
  return out;
}
function playAudio(base64) {
  if (!outputCtx || !active) return;
  const bytes = fromB64(base64);
  const pcm = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength/2));
  const buffer = outputCtx.createBuffer(1, pcm.length, 24000);
  const channel = buffer.getChannelData(0);
  for(let i=0;i<pcm.length;i++) channel[i]=pcm[i]/32768;
  const node=outputCtx.createBufferSource(); node.buffer=buffer; node.connect(outputCtx.destination);
  const now=outputCtx.currentTime;
  nextPlayTime=Math.max(nextPlayTime,now+0.03);
  node.start(nextPlayTime); nextPlayTime+=buffer.duration;
  app.classList.add("speaking"); status("Lisa बोल रही है…");
  node.onended=()=>{ if(active && outputCtx.currentTime>=nextPlayTime-0.05){app.classList.remove("speaking");app.classList.remove("listening"); status(micMuted?"माइक बंद है":"आप बोलिए…");}};
}
function stopAudio() {
  if(outputCtx){ nextPlayTime=outputCtx.currentTime; }
  app.classList.remove("speaking");
}
async function getToken() {
  const r=await fetch("/api/live-token",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});
  const d=await r.json().catch(()=>({}));
  if(!r.ok || !d.token) throw new Error(d.error || "Live token नहीं मिला");
  return d.token;
}
async function connect() {
  if(connecting||active)return;
  connecting=true; status("Lisa से जुड़ रही हूँ…");
  try{
    token=await getToken();
    const ai=new GoogleGenAI({apiKey:token});
    session=await ai.live.connect({
      model:MODEL,
      config:{
        responseModalities:[Modality.AUDIO],
        speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:"Kore"}}},
        systemInstruction:SYSTEM,
        inputAudioTranscription:{},
        outputAudioTranscription:{},
        realtimeInputConfig:{automaticActivityDetection:{disabled:false}}
      },
      callbacks:{
        onopen:()=>{status("Connected — बोलिए…");},
        onmessage:handleMessage,
        onerror:e=>{console.error("Lisa Live error",e);status("Voice connection में समस्या");},
        onclose:e=>{console.info("Lisa Live closed",e?.reason||""); if(active)status("Connection बंद हुआ");}
      }
    });
    active=true;
    app.classList.add("voice","listening");
    await startAudio();
    app.classList.add("listening"); status("🎙️ Lisa सुन रही है… बोलिए");
    session.sendClientContent({turns:[{role:"user",parts:[{text:"Say a brief warm greeting in Hindi and invite me to speak."}]}],turnComplete:true});
    $("mic-label").textContent="TAP TO END";
  }catch(e){
    console.error("Lisa start failed",e);
    status(e.message || "Lisa शुरू नहीं हो पाई");
    await cleanup(true);
  }finally{connecting=false;}
}
function handleMessage(message){
  const content=message?.serverContent;
  if(content?.inputTranscription?.text) status("आप: "+content.inputTranscription.text.slice(0,120));
  if(content?.outputTranscription?.text) status("Lisa: "+content.outputTranscription.text.slice(0,120));
  if(content?.modelTurn?.parts){
    for(const part of content.modelTurn.parts){
      if(part.inlineData?.data) playAudio(part.inlineData.data);
    }
  }
  if(content?.interrupted) stopAudio();
  if(content?.turnComplete && active){app.classList.remove("speaking");app.classList.remove("listening"); status(micMuted?"माइक बंद है":"आप बोलिए…");}
}
async function startAudio(){
  stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
  inputCtx=new AudioContext();
  outputCtx=new AudioContext();
  await inputCtx.resume(); await outputCtx.resume();
  source=inputCtx.createMediaStreamSource(stream);
  processor=inputCtx.createScriptProcessor(4096,1,1);
  processor.onaudioprocess=e=>{
    if(!active||micMuted||!session)return;
    const samples=resample(e.inputBuffer.getChannelData(0),inputCtx.sampleRate,16000);
    if(samples.length) session.sendRealtimeInput({audio:{data:pcm16Base64(samples),mimeType:"audio/pcm;rate=16000"}});
  };
  source.connect(processor); processor.connect(inputCtx.destination);
}
async function cleanup(closeSession=true){
  active=false;clearTimeout(reconnectTimer);
  app.classList.remove("voice","listening","speaking");
  $("mic-label").textContent="TAP TO SPEAK";
  try{processor?.disconnect();source?.disconnect();}catch{}
  processor=null;source=null;
  stream?.getTracks().forEach(t=>t.stop());stream=null;
  try{await inputCtx?.close();}catch{} inputCtx=null;
  try{await outputCtx?.close();}catch{} outputCtx=null;
  if(closeSession){try{session?.close();}catch{}}
  session=null;nextPlayTime=0;
}
$("mic").onclick=async()=>{
  if(active||connecting){await cleanup();status("Voice session बंद हो गया");return;}
  if(!navigator.mediaDevices?.getUserMedia){status("इस browser में microphone उपलब्ध नहीं है");return;}
  await connect();
};
$("stop").onclick=async()=>{await cleanup();status("Voice session बंद हो गया");};
window.addEventListener("pagehide",()=>{active=false;try{session?.close();stream?.getTracks().forEach(t=>t.stop());}catch{}});
