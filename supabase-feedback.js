const base = () => (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const key = () => process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "";
export const hasSupabase = () => !!(base() && key());

async function request(path, options = {}) {
  if (!hasSupabase()) throw new Error("Supabase is not connected. Set SUPABASE_URL and SUPABASE_SECRET_KEY in Vercel.");
  const r = await fetch(`${base()}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key(),
      Authorization: `Bearer ${key()}`,
      "Content-Type": "application/json",
      ...options.headers
    },
    cache: "no-store"
  });
  const body = await r.text();
  if (!r.ok) throw new Error(`Supabase error ${r.status}: ${body.slice(0, 300)}`);
  return body ? JSON.parse(body) : null;
}
export async function saveSupabaseFeedback(rating, name, instagram, message) {
  const rows = await request("lisa_feedback", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify([{ rating, name, instagram: instagram || null, message }])
  });
  return rows?.[0];
}
export async function listSupabaseFeedback(limit = 100) {
  const rows = await request(`lisa_feedback?select=id,created_at,rating,name,instagram,message&order=created_at.desc&limit=${limit}`);
  return { items: (rows || []).map(x => ({
    id: String(x.id), t: new Date(x.created_at).getTime(),
    rating: x.rating, name: x.name, instagram: x.instagram || "", message: x.message
  })) };
}
export async function deleteSupabaseFeedback(id) {
  const rows = await request(`lisa_feedback?id=eq.${encodeURIComponent(id)}&select=id`, {
    method: "DELETE", headers: { Prefer: "return=representation" }
  });
  return Array.isArray(rows) && rows.length > 0;
}


export async function supabaseRequest(path, options = {}) {
  return request(path, options);
}
export async function savePushSubscription(sub) {
  const row = {
    endpoint: sub.endpoint,
    p256dh: sub.keys?.p256dh || "",
    auth: sub.keys?.auth || "",
    updated_at: new Date().toISOString()
  };
  await request("lisa_push_subscriptions?on_conflict=endpoint", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([row])
  });
}
export async function listPushSubscriptions() {
  return request("lisa_push_subscriptions?select=endpoint,p256dh,auth");
}
export async function deletePushSubscription(endpoint) {
  await request(`lisa_push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, {
    method: "DELETE", headers: { Prefer: "return=minimal" }
  });
}
export async function getAppSettings() {
  const rows = await request("lisa_app_settings?select=key,value");
  return Object.fromEntries((rows || []).map(r => [r.key, r.value]));
}
export async function setAppSetting(keyName, value) {
  await request("lisa_app_settings?on_conflict=key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{ key: keyName, value: String(value), updated_at: new Date().toISOString() }])
  });
}
export async function recordApkDownload() {
  await request("lisa_download_events", {
    method: "POST", headers: { Prefer: "return=minimal" },
    body: JSON.stringify([{ downloaded_at: new Date().toISOString() }])
  });
}
export async function getDownloadCount() {
  const r = await fetch(`${base()}/rest/v1/lisa_download_events?select=id`, {
    method: "HEAD",
    headers: { apikey: key(), Authorization: `Bearer ${key()}`, Prefer: "count=exact", Range: "0-0" },
    cache: "no-store"
  });
  if (!r.ok) throw new Error(`Supabase download count error ${r.status}`);
  const range = r.headers.get("content-range") || "";
  const total = Number(range.split("/")[1]);
  return Number.isFinite(total) ? total : 0;
}
export async function getPublicAppInfo() {
  const [settings, downloads, feedback] = await Promise.all([
    getAppSettings(),
    getDownloadCount(),
    listSupabaseFeedback(1000)
  ]);
  const items = feedback.items || [];
  const avg = items.length ? Math.round(items.reduce((a, x) => a + Number(x.rating || 0), 0) / items.length * 10) / 10 : 0;
  return { actualDownloads: downloads, displayDownloads: Number(settings.display_download_count ?? downloads), rating: avg, reviewCount: items.length };
}
