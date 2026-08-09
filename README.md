# Mapping the Silence — Research Console (scaffold)

Pipeline: **Screenshot → ImageBB → Firestore → OCR (Tesseract.js, in-browser) → Grok
(split/correct/translate/classify) → Firestore → Review UI → Dashboard/Export**

## Stack
- **Frontend:** React + TypeScript + Vite, deployed on Vercel
- **Auth/DB:** Firebase (Auth + Firestore, free tier)
- **Image storage:** ImageBB (client uploads directly, bypassing the backend)
- **Backend:** Vercel Python serverless functions (`/api`) — Grok stage only
- **OCR:** Tesseract.js, entirely client-side in the researcher's browser —
  free, no API key, no usage cap, no Google/Azure account required
- **Classification:** Grok API, given OCR text only (not the image) to save cost

## Why this shape
- **ImageBB stays client-side.** Uploading straight from the browser to
  ImageBB, then only storing the resulting URL in Firestore, keeps large
  image bytes off the serverless functions entirely.
- **OCR runs in the browser, too.** Tesseract.js needs no native binary
  and no API key, which sidesteps two real constraints: Vercel's Python
  functions can't install a system Tesseract binary, and a hosted OCR API
  would mean an account and (eventually) a bill. The tradeoff is speed —
  it's slower per image than a hosted OCR API — and accuracy on messy
  screenshots is more variable than Google Vision's, so budget time for
  the human-review stage to catch OCR mistakes.
- **`/api/process` only does the Grok stage,** one image at a time. Vercel
  functions have a hard execution time limit; processing 100 screenshots
  means calling this endpoint 100 times (the Upload page does this
  automatically, once per screenshot, right after that screenshot's OCR
  finishes) rather than looping inside one long-running function.
- **Every pipeline stage is its own collection, never overwritten:**
  `images` → `ocr_results` → `comments` + `classifications` → `annotations`.
  If you change the theme taxonomy later, you re-run classification against
  the existing `comments` without re-running OCR.
- **AI classification is not ground truth.** `classifications/{commentId}`
  holds Grok's output; `annotations/{annotationId}` holds each researcher's
  independent accept/modify/reject review, keyed by `(commentId,
  researcherId)` so multiple researchers can code the same comment for
  inter-rater agreement (Cohen's/Fleiss' kappa) later.

## Setup
1. **Firebase:** create a project → enable Authentication (Email/Password
   or Google) → enable Firestore → deploy `firestore.rules`
   (`firebase deploy --only firestore:rules`) → generate a service account
   key (Project Settings → Service Accounts → Generate new private key).
2. **ImageBB:** get a free API key from https://api.imgbb.com/.
3. **Grok (xAI):** get an API key from https://console.x.ai/.
4. Copy `.env.example` → `.env.local`, fill in the `VITE_*` values.
5. In the Vercel project settings, set the server-side vars
   (`FIREBASE_SERVICE_ACCOUNT_JSON`, `GROK_API_KEY`) — never put these in
   a `VITE_*` var or they'd ship to the browser.

No OCR account or key is needed — Tesseract.js downloads the Amharic
(`amh`) trained-data model from its public CDN the first time a
researcher runs OCR in their browser, and reuses it for the rest of the
session.

```bash
npm install
npm run dev        # frontend on :5173
vercel dev         # in a second terminal, serves /api on :3000
```

Deploy: `vercel --prod` (Vercel auto-detects the Vite frontend and the
Python functions in `/api`).

## What's built vs. what's next
Built: upload flow (multi-file → ImageBB → Firestore → triggers
processing), the full OCR→Grok→Firestore pipeline for one image, the
Firestore data model (`src/types/research.ts`), and security rules.

Also built: the **Dashboard** (`src/pages/Dashboard.tsx`). It reads
`images` + `comments` + `classifications` + `annotations` from Firestore
client-side (`src/lib/dataset.ts` joins them into one flat `DatasetRow[]`),
then renders:
- Stat cards (screenshots, coded comments, violent/non-violent/uncertain)
- A theme-composition bar (the "signal vs. silence" summary — the silence
  theme is rendered with a hatched fill so it reads as distinct from the
  others at a glance)
- Theme frequency (bar), severity breakdown (donut), platform × theme
  comparison (stacked bar) — all via `recharts`, all interactive/filterable
- Filters for platform, severity, theme, and human-review status
- **Export buttons**: Excel (`.xlsx`, two sheets — full coded dataset +
  theme-frequency summary), CSV, and JSON — all built client-side with
  SheetJS (`src/lib/exportDataset.ts`), so no extra backend endpoint is
  needed. The exported columns match the "Research Dataset Export" table
  from the spec (Image ID, Platform, Raw/Corrected Amharic, English
  translation, violence flags, severity, AI confidence, human review
  status, notes, etc.).

At the moment the dashboard shows nothing until at least one screenshot has
been uploaded *and* processed — this is deliberate (see "Treat failure and
emptiness as moments for direction" — the empty state links straight to
Upload rather than showing a blank chart grid).

Stubbed (route exists, logic doesn't yet):
- **Review page** — comment-by-comment Accept/Modify/Reject UI writing to
  `annotations`. Once built, its writes are what populates the "Human
  Review Status" / "Human Themes" columns already wired into the dashboard
  and export.
- **Auth** — wire up `firebase/auth` and replace the placeholder
  `RESEARCHER_ID`/`RESEARCH_PROJECT_ID` constants in `src/pages/Upload.tsx`.
  Both the dashboard's Firestore reads and `firestore.rules` already assume
  a signed-in researcher, so nothing else needs to change once auth is in.

## A note on Vercel function limits
`maxDuration: 60` is set for `api/process.py` in `vercel.json`. It now only
runs the Grok stage (OCR happens in the browser before this is called), so
it has more margin than before — but confirm your current Vercel plan's
actual ceiling if Grok responses are consistently slow for large screenshots.

## A note on Tesseract.js accuracy
Client-side OCR trades some accuracy for being free and keyless. For messy
or low-resolution screenshots, expect more OCR errors than a hosted API
like Google Vision would produce. Two things in this scaffold exist
specifically to absorb that: Grok's system prompt (`api/_lib/grok.py`) is
told to correct obvious OCR errors before translating, and the Review page
(still to be built) is where a human researcher catches whatever Grok
couldn't fix.
