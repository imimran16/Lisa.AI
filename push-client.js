(() => {
 const btn=document.getElementById("enableNotifications"), status=document.getElementById("notifyStatus");
 const nums=document.getElementById("appNumbers");
 const b64ToBytes=s=>{const p="=".repeat((4-s.length%4)%4),raw=atob((s+p).replace(/-/g,"+").replace(/_/g,"/"));return Uint8Array.from(raw,c=>c.charCodeAt(0));};
 async function loadInfo(){try{const r=await fetch("/api/app-info",{cache:"no-store"});if(!r.ok)return;const d=await r.json();nums.textContent=`${Number(d.displayDownloads||0).toLocaleString()} downloads · ${d.rating||0} ★ (${d.reviewCount||0} reviews)`;}catch{}}
 if(btn) btn.addEventListener("click",async()=>{
   btn.disabled=true;
   try{
     if(!("serviceWorker" in navigator)||!("PushManager" in window))throw Error("Is browser/app mein push notifications supported nahi hain.");
     const permission=await Notification.requestPermission();
     if(permission!=="granted")throw Error("Notification permission allow karo.");
     const r=await fetch("/api/push-key",{cache:"no-store"}),k=await r.json();if(!r.ok)throw Error(k.error||"Push setup pending.");
     const reg=await navigator.serviceWorker.register("/sw.js");
     const sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64ToBytes(k.publicKey)});
     const saved=await fetch("/api/push-subscribe",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({subscription:sub.toJSON()})});
     const result=await saved.json();if(!saved.ok)throw Error(result.error||"Could not enable notifications.");
     status.textContent="Notifications enabled. Lisa can now send updates 💜";
   }catch(e){status.textContent=e.message||"Could not enable notifications.";}
   finally{btn.disabled=false;}
 });
 loadInfo();
})();
