# Lisa AI — Vercel + Gemini

## Deploy
1. Upload all files/folders in this project to your GitHub repository `imimran16/Lisa.AI`.
2. In Vercel: Add New → Project → Import `Lisa.AI`.
3. Framework preset: Other. Build command: leave empty. Output directory: `public`.
4. In Project → Settings → Environment Variables add:
   - `GEMINI_API_KEY` = your secret Gemini API key
   - `GEMINI_MODEL` = `gemini-2.5-flash` (or a model available to your API key)
5. Deploy. Open the Vercel URL.

API key is only used in `/api/chat.js`; never add it to public HTML/JS.
The browser voice uses Android/Chrome speech synthesis and recognition. Voice quality depends on installed device voices.
