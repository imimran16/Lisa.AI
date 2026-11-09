import { blobToken } from "../blobtoken.js";
import { put, list, del } from "@vercel/blob";
import { timingSafeEqual } from "node:crypto";

const same = (a, b) => {
  const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || ""));
  return x.length === y.length && timingSafeEqual(x, y);
};

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Only POST requests are allowed." });
  }
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return res.status(500).json({ error: "ADMIN_PASSWORD is not set in Vercel." });
  if (!same(req.headers["x-admin-password"], password)) return res.status(401).json({ error: "Wrong password." });
  const token = blobToken();
  if (!token) return res.status(500).json({ error: "Vercel Blob storage is not connected. In Vercel open Storage, create a Blob store, connect it to this project, then Redeploy." });

  const body = req.body || {};
  try {
    if (body.action === "list") {
      const { blobs } = await list({ prefix: "gallery/", token });
      return res.status(200).json({ photos: blobs.map(b => ({ url: b.url, name: b.pathname })) });
    }
    if (body.action === "upload") {
      const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(body.data || "");
      if (!m) return res.status(400).json({ error: "Only JPG, PNG or WebP images are allowed." });
      const buf = Buffer.from(m[2], "base64");
      if (buf.length > 4 * 1024 * 1024) return res.status(413).json({ error: "Image is too large." });
      const ext = m[1] === "image/png" ? "png" : m[1] === "image/webp" ? "webp" : "jpg";
      const out = await put(`gallery/photo.${ext}`, buf, { access: "public", contentType: m[1], addRandomSuffix: true, token });
      return res.status(200).json({ url: out.url });
    }
    if (body.action === "delete") {
      if (typeof body.url !== "string" || !body.url.startsWith("https://") || !body.url.includes("/gallery/")) {
        return res.status(400).json({ error: "Invalid photo URL." });
      }
      await del(body.url, { token });
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: "Unknown action." });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error." });
  }
}
