import { list } from "@vercel/blob";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(200).json({ photos: [] });
  try {
    const { blobs } = await list({ prefix: "gallery/" });
    return res.status(200).json({ photos: blobs.map(b => b.url) });
  } catch {
    return res.status(200).json({ photos: [] });
  }
}
