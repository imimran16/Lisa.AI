import { list } from "@vercel/blob";
import { blobToken } from "../blobtoken.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const token = blobToken();
  if (!token) return res.status(200).json({ photos: [] });
  try {
    const { blobs } = await list({ prefix: "gallery/", token });
    return res.status(200).json({ photos: blobs.map(b => b.url) });
  } catch {
    return res.status(200).json({ photos: [] });
  }
}
