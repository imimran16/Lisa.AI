// Anonymous usage counters + feedback, stored in Upstash Redis / Vercel KV (REST). Day = India time (IST).
const url = () => process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const tok = () => process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
export const hasStore = () => !!(url() && tok());
async function pipe(cmds) {
  const r = await fetch(`${url()}/pipeline`, { method: "POST", headers: { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json" }, body: JSON.stringify(cmds) });
  if (!r.ok) throw new Error("store status " + r.status);
  return (await r.json()).map(x => { if (x.error) throw new Error(x.error); return x.result; });
}
export const dayKey = (back = 0) => new Date(Date.now() + 19800000 - back * 86400000).toISOString().slice(0, 10);
const TTL = "10368000", EVENTS = ["visit", "chat", "voice", "photo", "fb"];
function trackCmds(event, id) {
  const d = dayKey(), k = `st:${event}:${d}`;
  const c = [["INCR", k], ["EXPIRE", k, TTL], ["INCR", `st:${event}:all`]];
  if (event === "visit" && id) c.push(["PFADD", `st:uv:${d}`, id], ["EXPIRE", `st:uv:${d}`, TTL], ["PFADD", "st:uv:all", id]);
  return c;
}
export async function track(event, id) {
  if (!hasStore() || !EVENTS.includes(event)) return;
  try { await pipe(trackCmds(event, String(id || "").slice(0, 64))); } catch (e) { console.error("track:", e.message); }
}
export async function getStats(days = 14) {
  const ds = Array.from({ length: days }, (_, i) => dayKey(days - 1 - i)), cmds = [];
  for (const d of ds) { cmds.push(["PFCOUNT", `st:uv:${d}`]); for (const e of EVENTS) cmds.push(["GET", `st:${e}:${d}`]); }
  cmds.push(["PFCOUNT", "st:uv:all"]); for (const e of EVENTS) cmds.push(["GET", `st:${e}:all`]);
  cmds.push(["GET", "st:fbsum"], ["GET", "st:fbcnt"]);
  const r = await pipe(cmds), n = v => Number(v) || 0, per = EVENTS.length + 1;
  const out = ds.map((date, i) => { const o = { date, uv: n(r[i * per]) }; EVENTS.forEach((e, j) => { o[e] = n(r[i * per + 1 + j]); }); return o; });
  const b = days * per, totals = { uv: n(r[b]) }; EVENTS.forEach((e, j) => { totals[e] = n(r[b + 1 + j]); });
  const sum = n(r[b + 1 + EVENTS.length]), cnt = n(r[b + 2 + EVENTS.length]);
  return { days: out, totals, rating: { avg: cnt ? Math.round(sum / cnt * 10) / 10 : 0, count: cnt } };
}
export async function saveFeedback(rating, message) {
  await pipe([["LPUSH", "lisa:fb", JSON.stringify({ t: Date.now(), rating, message })], ["LTRIM", "lisa:fb", "0", "499"], ["INCRBY", "st:fbsum", String(rating)], ["INCR", "st:fbcnt"], ...trackCmds("fb")]);
}
export async function listFeedback(n = 50) {
  const [rows] = await pipe([["LRANGE", "lisa:fb", "0", String(n - 1)]]);
  return { items: (rows || []).map(x => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean) };
}
