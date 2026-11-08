import { GoogleGenAI, Modality } from "https://esm.sh/@google/genai";

(() => {
  "use strict";
  const button = document.getElementById("voiceButton");
  const buttonLabel = document.getElementById("buttonLabel");
  const statusLine = document.getElementById("statusLine");
  const statusDetail = document.getElementById("statusDetail");
  const micToggle = document.getElementById("micToggle");
  const micToggleLabel = document.getElementById("micToggleLabel");
  const micToggleIcon = document.getElementById("micToggleIcon");
  if (!button) return;

  let session=null, stream=null, inputCtx=null, outputCtx=null, source=null,
      processor=null, silentGain=null, muted=false, starting=false,
      nextPlayTime=0, playing=[];
  const SYSTEM = `You are Lisa, a warm, caring female AI friend. Never offer or claim to set alarms, reminders, timers or calendar events; you cannot do those, so never mention them as a feature. When asked what you can do, or about your features, answer with this list in Hindi: Chat: रोज़ बातें करना, हालचाल पूछना और दिन कैसा रहा जानना। Care: जब आप उदास हों तो आपकी बात सुनना और हौसला देना। Fun: मज़ाक करना, हँसना और मज़ेदार बातें करना। Voice Talk: आपकी आवाज़ सुनना और अपनी आवाज़ में जवाब देना। Emotional Support: आपकी परेशानियों को समझना और आपको अकेला महसूस न होने देना। Memories: आपकी पसंद, बातें और पुराने अनुभव याद रखना। Friendly Conversation: आपकी पसंद, सपने, पढ़ाई और भविष्य के बारे में बात करना. Speak naturally in Hindi, Hinglish, or English and match the user's language. Be friendly, concise and conversational, with a soft feminine voice.`;

  function status(state,title,detail) {
    document.body.dataset.state=state;
    statusLine.textContent=title.toUpperCase();
    statusDetail.textContent=detail||"Hindi · Hinglish · English";
    button.classList.toggle("active",!!session);
    buttonLabel.textContent=session?"TAP TO STOP":"TAP TO SPEAK";
    if(micToggle){
      micToggle.hidden=!session;
      micToggle.setAttribute("aria-pressed",String(muted));
      micToggle.setAttribute("aria-label",muted?"Turn microphone on":"Turn microphone off");
      micToggleLabel.textContent=muted?"MIC OFF":"MIC ON";
    }
  }
  function b64(bytes){let s="";for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(s);}
  function resample(data,rate){
    if(rate===16000)return data;
    const ratio=rate/16000, out=new Float32Array(Math.floor(data.length/ratio));
    for(let i=0;i<out.length;i++){let a=Math.floor(i*ratio),b=Math.min(Math.floor((i+1)*ratio),data.length),sum=0,n=0;for(let j=a;j<b;j++){sum+=data[j];n++;}out[i]=n?sum/n:0;}
    return out;
  }
  function pcm16(data){const p=new Int16Array(data.length);for(let i=0;i<data.length;i++){const x=Math.max(-1,Math.min(1,data[i]));p[i]=x<0?x*32768:x*32767;}return new Uint8Array(p.buffer);}
  function playAudio(data){
    if(!outputCtx)return;
    const bin=atob(data), pcm=new Int16Array(bin.length/2);
    for(let i=0;i<pcm.length;i++){let v=(bin.charCodeAt(i*2+1)<<8)|bin.charCodeAt(i*2);if(v>32767)v-=65536;pcm[i]=v;}
    const buf=outputCtx.createBuffer(1,pcm.length,24000), ch=buf.getChannelData(0);
    for(let i=0;i<pcm.length;i++)ch[i]=pcm[i]/32768;
    const node=outputCtx.createBufferSource();node.buffer=buf;node.connect(outputCtx.destination);
    const at=Math.max(outputCtx.currentTime+.02,nextPlayTime);node.start(at);nextPlayTime=at+buf.duration;playing.push(node);
    node.onended=()=>playing=playing.filter(x=>x!==node);
  }
  function stopAudio(){playing.forEach(n=>{try{n.stop()}catch{}});playing=[];nextPlayTime=outputCtx?.currentTime||0;}
  async function start(){
    if(starting||session)return;starting=true;button.disabled=true;status("connecting","Connecting…","Lisa is getting ready");
    try{
      if(!navigator.mediaDevices?.getUserMedia)throw Error("Microphone needs HTTPS and browser permission.");
      const r=await fetch("/api/live-token",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}",cache:"no-store"});
      const token=await r.json();if(!r.ok||!token.token)throw Error(token.error||"Could not connect voice service.");
      stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
      inputCtx=new AudioContext();outputCtx=new AudioContext();await Promise.all([inputCtx.resume(),outputCtx.resume()]);
      const ai=new GoogleGenAI({apiKey:token.token,httpOptions:{apiVersion:"v1alpha"}});
      session=await ai.live.connect({model:"gemini-3.8-live",config:{
        responseModalities:[Modality.AUDIO],
        speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:"Kore"}}},
        inputAudioTranscription:{},outputAudioTranscription:{},
        systemInstruction:{parts:[{text:SYSTEM}]}
      },callbacks:{
        onopen:()=>status("listening","Listening…","बोलिए, Lisa सुन रही है"),
        onmessage:m=>{
          const c=m.serverContent||{};
          if(c.interrupted){stopAudio();status("listening","Listening…","बोलिए, Lisa सुन रही है");}
          if(c.inputTranscription?.text)status("listening","You: "+c.inputTranscription.text,"Lisa सुन रही है");
          if(c.outputTranscription?.text)status("speaking","Lisa: "+c.outputTranscription.text,"Lisa जवाब दे रही है");
          for(const part of c.modelTurn?.parts||[])if(part.inlineData?.data){playAudio(part.inlineData.data);status("speaking","Lisa is speaking…","Natural female voice · Kore");}
          if(c.turnComplete)status("listening","Listening…","अगला सवाल पूछिए");
        },
        onerror:e=>{console.error("Lisa Live voice error",e);status("error","Voice connection error","Session बंद करके फिर कोशिश करें");},
        onclose:()=>status("idle","Disconnected","फिर बात करने के लिए tap करें")
      }});
      source=inputCtx.createMediaStreamSource(stream);processor=inputCtx.createScriptProcessor(4096,1,1);silentGain=inputCtx.createGain();silentGain.gain.value=0;
      processor.onaudioprocess=e=>{if(!session||!inputCtx||muted)return;const samples=resample(e.inputBuffer.getChannelData(0),inputCtx.sampleRate);session.sendRealtimeInput({audio:{data:b64(pcm16(samples)),mimeType:"audio/pcm;rate=16000"}});};
      source.connect(processor);processor.connect(silentGain);silentGain.connect(inputCtx.destination);
      muted=false;status("listening","Listening…","Lisa की natural female voice · Kore");
      session.sendClientContent({turns:[{role:"user",parts:[{text:"Say a warm short greeting in Hindi/Hinglish. Introduce yourself as Lisa, my friendly AI friend, then invite me to speak. Keep it brief."}]}],turnComplete:true});
    }catch(e){console.error(e);status("error","Could not start",e.message||"Check internet and microphone permission");await stop(false);}
    finally{starting=false;button.disabled=false;}
  }
  async function stop(reset=true){
    try{if(processor){processor.onaudioprocess=null;processor.disconnect();}source?.disconnect();silentGain?.disconnect();session?.close();}catch{}
    session=null;processor=null;source=null;silentGain=null;
    if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;stopAudio();
    try{await inputCtx?.close();}catch{}try{await outputCtx?.close();}catch{}
    inputCtx=outputCtx=null;muted=false;status("idle","Lisa is resting","जब बात करनी हो, button दबाएँ");buttonLabel.textContent="TAP TO SPEAK";
  }
  function toggleMic(){if(!stream)return;muted=!muted;stream.getAudioTracks().forEach(t=>t.enabled=!muted);status(muted?"idle":"listening",muted?"MICROPHONE OFF":"Listening…",muted?"Lisa बोल सकती है; mic बंद है":"बोलिए, Lisa सुन रही है");}
  button.addEventListener("click",()=>session?stop():start());
  micToggle?.addEventListener("click",toggleMic);
  window.addEventListener("beforeunload",()=>{session?.close();stream?.getTracks().forEach(t=>t.stop());});
  status("idle","Ready when you are","Tap the button and say hello");
})();
