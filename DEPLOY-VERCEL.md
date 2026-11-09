# Ello AI Tutor — Peak (Vercel build)

This folder is the **static client** of Ello AI, packaged for Vercel. It is deliberately small (~80 KB zipped)
and contains no server code, no `node_modules`, no database and no secrets.

## Deploy in 60 seconds

1. Unzip this folder.
2. In the folder, run:

   ```bash
   npx vercel
   ```

   Press Enter through the prompts (Vercel reads `vercel.json`, so accept the detected settings).
   For the public URL, run `npx vercel --prod`.

Or, without the CLI: drag the unzipped folder onto <https://vercel.com/new> (Vercel imports the folder as a
project), keep **Framework preset: Vite**, **Build command: `npm run build`**, **Output directory: `dist`**.

## What Vercel runs

| Setting | Value |
| --- | --- |
| Install | `npm install` |
| Build | `npm run build` (Vite, root `web/`, output `dist/`) |
| Output | `dist` |
| Node | Vercel default (no engine pin, so no version conflict) |

`vercel.json` already sets all of this plus an SPA fallback rewrite, so no dashboard configuration is needed.

## What works on Vercel

Fully static, no backend and no accounts — everything below runs in the browser:

- The study studio opens straight away; no login, sign-up or profile screen
- Gemini boards, flashcards and tutor chat (the key is pasted once and kept in this browser)
- Whiteboard ink, notes, cards, chat log, uploaded file list, exam results and streaks in `localStorage`
- The ten-question mock exam and the six reading voices

PDF text extraction still needs the optional Express API from the full-stack archive; on a static host the upload
tab keeps the file list and you paste the parts you want to study.

## Notes

- The build is a single-page app; `/assets/*` is cached immutably and every other path serves `index.html`.
- There is no Firebase config and no auth code in this package.
- The Gemini key is **not** in this package: it is typed into the app's header and stored in that browser's
  `localStorage`, which keeps the archive free of credentials.
