# Ello AI — solo study studio

One person, one browser, no accounts. Paste notes and Gemini draws a hand-drawn board, writes flashcards,
answers questions and reads the board aloud. Everything is saved in this browser's `localStorage`.

## Run it

```bash
npm install
npm run build      # Vite builds web/ into dist/
npm run preview    # serve the built app locally
```

## Gemini key

Click **Add Gemini key** in the header and paste a key from aistudio.google.com/apikey once. It is stored in this
browser only; the archive itself contains no credentials. Model defaults to `gemini-3.5-flash`.

## Saved on this device

Board, ink strokes, pasted notes, flashcards, chat log, uploaded file list, mock-exam results and the study streak
are all in `localStorage`. Clearing site data resets the workspace.

## Deploying

`vercel.json` is included: import the folder (or `npx vercel`) and Vercel runs `npm run build` into `dist`.
No server, database or environment variables are required. See DEPLOY-VERCEL.md.
