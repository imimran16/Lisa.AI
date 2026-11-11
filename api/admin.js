import { timingSafeEqual } from "node:crypto";
import { hasStore, getStats, listFeedback } from "../stats.js";

const DIR = "photos/lisa-gallery";
const API = process.env.GITHUB_API_URL || "https://api.github.com";
const IMG = /\.(jpe?g|png|webp|avif|gif)$/i;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const same = (a, b) => {
  const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || ""));
  return x.length === y.length && timingSafeEqual(x, y);
};
const kind = b =>
  b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff ? "jpg" :
  b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) ? "png" :
  b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP" ? "webp" : null;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Only POST requests are allowed." });
  }
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return res.status(500).json({ error: "ADMIN_PASSWORD is not set in Vercel." });
  if (!same(req.headers["x-admin-password"], pw)) { await sleep(800); return res.status(401).json({ error: "Wrong password." }); }
  const b0 = req.body || {};
  if (b0.action === "ping") return res.status(200).json({ ok: true });
  if (b0.action === "stats" || b0.action === "feedback") {
    if (!hasStore()) return res.status(503).json({ error: "Upstash Redis (or Vercel KV) is not connected. In Vercel: Storage, create Upstash Redis, connect it to this project, then Redeploy." });
    try { return res.status(200).json(b0.action === "stats" ? await getStats(14) : await listFeedback(50)); }
    catch (e) { return res.status(502).json({ error: "Could not read data: " + e.message }); }
  }
  const missing = ["GITHUB_TOKEN", "GITHUB_REPO"].filter(k => !process.env[k]);
  if (missing.length) return res.status(500).json({ error: missing.join(" and ") + " not set in Vercel. See README (Gallery & Admin), then Redeploy." });

  const { GITHUB_TOKEN: token, GITHUB_REPO: repo } = process.env;
  const gh = (p, o = {}) => fetch(`${API}/repos/${repo}${p}`, {
    ...o,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "lisa-admin", "Content-Type": "application/json" }
  });
  const fail = async r => {
    const j = await r.json().catch(() => ({}));
    throw new Error(r.status === 401 || r.status === 403 ? "GitHub rejected the token. It needs Contents: Read and write access to this repo."
      : r.status === 404 ? "GitHub repo or file not found. Check GITHUB_REPO (owner/repo) and that the token can access it."
      : j.message || "GitHub error " + r.status);
  };
  const body = req.body || {};
  try {
    let branch = process.env.GITHUB_BRANCH;
    if (!branch) { const r = await gh(""); if (!r.ok) await fail(r); branch = (await r.json()).default_branch; }
    const ref = encodeURIComponent(branch);

    if (body.action === "list") {
      const r = await gh(`/contents/${DIR}?ref=${ref}`);
      if (r.status === 404) return res.status(200).json({ photos: [] });
      if (!r.ok) await fail(r);
      const items = (await r.json()).filter(f => f.type === "file" && IMG.test(f.name) && !f.name.startsWith("."));
      return res.status(200).json({ photos: items.map(f => ({ name: f.name, url: `/${DIR}/${encodeURIComponent(f.name)}` })) });
    }
    if (body.action === "upload") {
      const m = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(body.data || "");
      if (!m) return res.status(400).json({ error: "Only JPG, PNG or WebP images are allowed." });
      const buf = Buffer.from(m[1], "base64"), ext = kind(buf);
      if (!ext) return res.status(400).json({ error: "This file is not a valid image." });
      if (buf.length > 4 * 1024 * 1024) return res.status(413).json({ error: "Image is too large (max 4 MB)." });
      const name = `lisa-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
      const r = await gh(`/contents/${DIR}/${name}`, { method: "PUT", body: JSON.stringify({ message: `Add Lisa photo ${name}`, content: m[1], branch }) });
      if (!r.ok) await fail(r);
      return res.status(200).json({ name, url: `/${DIR}/${name}` });
    }
    if (body.action === "delete") {
      const name = String(body.name || "");
      if (!name || /[\/\\]/.test(name) || name.startsWith(".")) return res.status(400).json({ error: "Invalid photo name." });
      const p = `/contents/${DIR}/${encodeURIComponent(name)}`;
      const g = await gh(`${p}?ref=${ref}`); if (!g.ok) await fail(g);
      const d = await gh(p, { method: "DELETE", body: JSON.stringify({ message: `Remove Lisa photo ${name}`, sha: (await g.json()).sha, branch }) });
      if (!d.ok) await fail(d);
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: "Unknown action." });
  } catch (e) {
    return res.status(502).json({ error: e.message || "Server error." });
  }
}
