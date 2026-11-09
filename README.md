# Lisa AI — Voice Assistant

Vanilla HTML, CSS and JavaScript frontend with a Vercel Node.js serverless endpoint for Gemini.

## Deploy

1. Add all files to the root of your GitHub repository. Keep `api/chat.js` inside the `api` folder.
2. In Vercel, open your project → Settings → Environment Variables.
3. Add `GEMINI_API_KEY` with your Google AI Studio API key. Do not add the key to `script.js` or any browser-side file.
4. Optional: add `GEMINI_MODEL` with `gemini-3.5-flash-lite`.
5. Save and redeploy the project.

## Local development

Install Vercel CLI and run:

```bash
npm install -g vercel
vercel dev
```

Add `GEMINI_API_KEY=your_key_here` to a local `.env.local` file (never commit it).

## Browser notes

- Use the deployed HTTPS URL.
- Microphone permission is required.
- Speech recognition support and available Hindi voices depend on the browser and operating system. Chrome on Android/desktop is recommended.
- The browser's built-in speech synthesis chooses an available Hindi/Indian voice; it cannot guarantee that every device has a female Hindi voice.
- Voice recognition is browser-provided, not Gemini audio transcription. Gemini generates the answer; the browser speaks it.


## Lisa gallery & admin panel
- Photos live in `photos/lisa-gallery/` (any image added there appears in Lisa's gallery automatically).
- Admin panel: `/admin.html`. Upload there; photos are auto-renamed (`lisa-xxxx.jpg`), shrunk to ~1400px and committed to GitHub, then Vercel redeploys (1-2 min).
- Vercel environment variables (then Redeploy):
  - `ADMIN_PASSWORD` - password for the admin page
  - `GITHUB_TOKEN` - fine-grained token, only this repo, permission Contents: Read and write
  - `GITHUB_REPO` - `owner/repo`
  - `GITHUB_BRANCH` - optional (default: repo's default branch)
- `photos/lisa.jpg` = Lisa's DP, `photos/creator.jpg` = creator photo, icons in `icons/`.
