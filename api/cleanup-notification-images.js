export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: "Unauthorized" });
  const base = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "";
  if (!base || !key) return res.status(503).json({ error: "Supabase is not configured" });
  const bucket = "lisa-notification-temp";
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  try {
    const listed = await fetch(`${base}/storage/v1/object/list/${bucket}`, { method: "POST", headers, body: JSON.stringify({ prefix: "", limit: 1000, offset: 0, sortBy: { column: "created_at", order: "asc" } }) });
    if (!listed.ok) throw new Error(`Storage list failed (${listed.status})`);
    const objects = await listed.json();
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const expired = (objects || []).filter(x => x.name && x.created_at && new Date(x.created_at).getTime() < cutoff).map(x => x.name);
    if (!expired.length) return res.status(200).json({ ok: true, deleted: 0 });
    const removed = await fetch(`${base}/storage/v1/object/${bucket}`, { method: "DELETE", headers, body: JSON.stringify({ prefixes: expired }) });
    if (!removed.ok) throw new Error(`Storage delete failed (${removed.status})`);
    return res.status(200).json({ ok: true, deleted: expired.length });
  } catch (e) { return res.status(502).json({ error: e.message }); }
}
