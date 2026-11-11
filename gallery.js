import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Lists every image inside photos/lisa-gallery/. Any file name works (spaces, capitals, Hindi, etc.).
const EXT = /\.(jpe?g|png|webp|avif|gif)$/i;
const here = path.dirname(fileURLToPath(import.meta.url));
const dirs = [
  path.join(process.cwd(), "photos", "lisa-gallery"),
  path.join(here, "..", "photos", "lisa-gallery")
];

export default async function handler(req, res) {
  for (const dir of dirs) {
    try {
      const files = (await readdir(dir)).filter(f => EXT.test(f) && !f.startsWith(".")).sort();
      res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
      return res.status(200).json({ photos: files.map(f => "/photos/lisa-gallery/" + encodeURIComponent(f)) });
    } catch {}
  }
  return res.status(200).json({ photos: [] });
}
