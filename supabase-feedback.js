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
