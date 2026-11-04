# Recall — Voice Follow Up

An iPhone-first Next.js PWA for saving conversations and next steps. Each account has its own contacts, interaction timeline, actions, sessions, and push subscriptions.

## Run locally

Requirements: Node.js 24 or later and npm.

```bash
npm install
npm run dev
```

Open **http://localhost:3000** (or the Local URL printed by Next.js) and create an account. Create `.env.local` from `.env.example` and fill in the keys you need. The local SQLite database is created in `data/recall.sqlite`; it persists between restarts and is excluded from version control. `npm run typecheck` and `npm run build` check the project.

## What works without credentials

- Email/password accounts with server-side password hashing and HTTP-only session cookies.
- Account-isolated contacts, auto-matching, editable contact choice or creation, conversation timelines, and action status/rescheduling.
- Typed notes and microphone recording with a live, sound-responsive waveform. The clip is saved to this device’s browser storage before transcription; the latest clip for each account can be played back and retried after a page refresh.
- **Local rule extraction** of contact names, multiple actions, and IST dates. Review and correct every extracted field before saving. The badge says “Local rule extraction.” This is a development adapter, not an AI model; it may miss ambiguous language.
- **Local summary** answers from saved history and pending commitments. The answer badge says “Local summary.”
- A mobile-first follow-up home screen with tappable All, Today, Overdue, Upcoming, and Completed summary boxes. Each opens its filtered list on the same page; today’s cards are highlighted. Quick follow-up entry stays on that page. Calendar remains a separate view, with month on mobile and day, week, and month on desktop.
- Per-person action boards for meetings/reminders, follow-ups, completed tasks, and archived tasks. Completed tasks update immediately, and archived tasks can be reopened or removed from the board.
- Manual action entry for a follow-up, callback, reminder, or meeting. It can use an existing person or create a new one, and it saves the entered context to that person’s timeline. Quick entry, manual entry, review, and rescheduling share a themed IST date picker with Today, Tomorrow, a calendar, and optional time. Date-only actions use 9:00 a.m. IST for reminder scheduling.
- Screen selection is kept in the URL hash, so refreshing Calendar, People, a person profile, Settings, or manual entry returns to that screen.
- Account-wide reminder controls for all dated actions, including a choice of 0, 15, 30, 60, or 1,440 minutes before the due time.
- On-screen browser notifications for due actions while the app is open and notification permission has been granted. This does not provide background delivery.
- A per-account Google Sheet outbox. Conversations and action updates are queued until that account configures a Sheet webhook; failed sends remain queued and can be retried.

All saved times are UTC instants, interpreted and displayed in **Asia/Kolkata (IST)**. The review screen lets you correct when a conversation happened; that timestamp cannot be in the future. Follow-up and meeting due times can be in the future, and phrases such as “in 4 hrs” are resolved from the current IST time. A selected timed action in the past raises an alert. No money fields exist yet; any future money values should use INR.

## Enable real AI and iPhone audio transcription

Set `GEMINI_API_KEY` in `.env.local` to enable Google Gemini audio transcription for English, Tamil, and mixed speech. This is the Gemini API, not Google Cloud Speech-to-Text. Recall uses KaryaAI’s `@google/genai` structured JSON transcription request and retry policy. On iPhone, it records 16 kHz mono WAV through Web Audio before saving the clip locally; other browsers use MediaRecorder. The server uses `GEMINI_TRANSCRIPTION_MODEL` (default `gemini-3.5-flash-lite`). An existing OpenAI key remains a fallback if no Gemini key is set; `OPENAI_API_KEY` also enables AI action extraction and contextual answers. Without either key, recording still saves locally and the user can type the transcript. The app does not display audio playback controls. A browser speech preview can show interim words while speaking where supported; that browser feature may use the browser vendor’s speech service. Gemini supplies the final transcript automatically after Stop, with one retry for interrupted requests and another attempt when connectivity returns. Review remains required before saving. Audio is saved in IndexedDB on the device first, then sent to the configured transcription provider. Recall’s server and Google Sheet store the transcript, not the original audio file. The provider receives the audio for transcription.

`OPENAI_MODEL` optionally changes the text model. If Gemini is absent, the server uses `gpt-transcribe` for recorded audio. Failed configured AI requests surface an error; they do not silently switch to local rules.

## Enable background Web Push

Generate VAPID keys with `npx web-push generate-vapid-keys`, set `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, and `CRON_SECRET` in `.env.local`, then restart. Tap **Enable alerts** on each device to create an account-owned subscription.

The authenticated dispatcher is `PUT /api/dispatch` with `Authorization: Bearer <CRON_SECRET>`. It sends due actions to subscriptions belonging to the action's user at the account’s selected lead time and records successful delivery. Run `npm run dev:dispatch` in a second terminal for a local check every minute; keep both terminals open. A deployed scheduler is still required for production.

For iPhone background Web Push, users need a supported iOS version, an HTTPS deployment, and the PWA added to the Home Screen before enabling notifications. Localhost is useful for desktop testing; it does not establish the full iPhone push path.

## Connect a Google Sheet and morning email

A native Google Sheet template has been created for this project. Each salesperson should use **their own copy** so their conversation data stays separate. The same instructions are available inside the app at **Settings → How to connect your Sheet**, with an example Sheet link and an Apps Script download.

1. Open the salesperson’s Sheet. In **Extensions → Apps Script**, paste the contents of `integrations/RecallSheet.gs` into its script project.
2. In **Project Settings → Script properties**, set `RECALL_SECRET` to a random string of at least 16 characters and `DIGEST_EMAIL` to that salesperson’s email address. Set the script project time zone to **Asia/Kolkata**.
3. Run `setupRecall` once in the Apps Script editor and authorize the requested Sheet and email permissions. It creates the tabs and a daily time trigger.
4. Deploy the script as a **Web app** that executes as the Sheet owner and is accessible to **Anyone**. The random secret in every POST request protects writes; keep it private. Copy the `/exec` URL.
5. In Recall’s **Settings**, paste the web app URL and the same secret, then save. Recall tests the connection, sends queued transcripts and actions, and sends future changes after saving. Use **Retry queued updates** if a send fails.

The Sheet has **Conversations**, **Actions**, and **Processed Events** tabs. Actions are updated in place when completed or rescheduled. The Apps Script email lists today’s pending actions in IST; an empty day gets the “next prospect” message. Apps Script’s daily time trigger runs **around** 8 a.m. IST rather than at an exact minute. If delivery strictly by 8:00 is required, use a scheduler with a delivery guarantee. The app has not yet been connected to a deployed script, so no live Sheet transfer or email is running.

## Production on Vercel and Supabase

Run `supabase/schema.sql` once in the intended Supabase project's SQL Editor. Set `SUPABASE_URL` and `SUPABASE_SECRET_KEY` as **server-only** production variables in Vercel. The key must be a Supabase secret or service-role key with access to the Recall tables. Never add it to a `NEXT_PUBLIC_` variable. When these two variables are present, Recall stores users, sessions, contacts, notes, actions, settings, push subscriptions, and Sheet outbox events in Supabase. Without them, localhost uses its existing SQLite database. Production refuses to start its API without the database variables, rather than writing to an ephemeral SQLite file.

For an **existing** Recall Supabase project, run `supabase/optional-contact-migration.sql` in that project's SQL Editor **before deploying a build that allows contact-free notes**. It makes the two contact references nullable and updates the save function; existing records remain intact. New projects should use `supabase/schema.sql`. Local SQLite applies its migration automatically when the development server restarts. If a salesperson uses Google Sheets, redeploy the updated `integrations/RecallSheet.gs` script so blank person names are accepted and the morning email omits empty name parentheses.

Set `GEMINI_API_KEY` and `GEMINI_TRANSCRIPTION_MODEL` for real Google Gemini audio transcription. Set `NEXT_PUBLIC_VAPID_PUBLIC_KEY` as a public/config value, and `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, and `CRON_SECRET` as server secrets for Web Push. For background reminders, enable `pg_cron` and `pg_net` in Supabase, save the same `CRON_SECRET` as a Vault secret named `recall_cron_secret`, then run `supabase/reminder-cron.sql` in that project's SQL Editor. It calls the protected Vercel route every five minutes, so delivery can trail the selected lead time by several minutes. The app also gives in-app alerts while open. Google Sheets and its morning email are configured separately by each account in Settings.

The Supabase schema enables RLS without browser policies. All data access goes through server routes, which check the session user ID on each request. Each salesperson connects their own Google Sheet in Settings; no Sheet URL is needed to deploy. The live database can start empty without copying localhost accounts or notes. Test sign-up, contact/action isolation, Gemini transcription on a real device, installed-PWA Web Push on iPhone, and the scheduler after deployment.
