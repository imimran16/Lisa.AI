import { readFile } from "node:fs/promises";
import path from "node:path";

import { recordApkDownload } from "../supabase-feedback.js";

// Serve the Android package through a Node function so Vercel sends a
// predictable binary response instead of relying on static-file handling.
export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ error: "Method not allowed." });
  }

  try {
    const file = path.join(process.cwd(), "downloads", "Lisa.apk");
    const apk = await readFile(file);
    res.setHeader("Content-Type", "application/vnd.android.package-archive");
    res.setHeader("Content-Disposition", 'attachment; filename="Lisa.apk"');
    res.setHeader("Content-Length", String(apk.length));
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (req.method === "HEAD") return res.status(200).end();
    try { await recordApkDownload(); } catch (e) { console.error("download count:", e.message); }
    return res.status(200).end(apk);
  } catch {
    return res.status(404).json({ error: "Lisa.apk is missing from the deployment. Include downloads/Lisa.apk and redeploy." });
  }
}
