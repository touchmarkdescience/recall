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


## PWA voice review and optional follow-up scheduling — November 2026

The PWA keeps browser live speech as the primary transcript. At Stop, it freezes the live text already visible, saves the audio locally, and allows up to 200 ms for final words to append only when the existing prefix is unchanged. Later events cannot rewrite the words visible at Stop. It no longer automatically replaces usable live text with a second recognition result. Google/Groq transcribes automatically only when browser text is missing. There is no separate re-transcription button in the normal recording flow. If the versions differ, the user chooses; names are not silently substituted. Provider requests explicitly use automatic Tamil/English detection, without injecting the entire saved address book as spelling hints. Recognized proper-name spellings still require real-audio verification and may need editing. Browser live recognition still uses the browser's selected recognition language; provider language detection is separate.

**Review details** does not call the AI extraction API. Clear English meeting/task phrases and a limited Tamil/Tanglish scheduling grammar are handled by client-side rules. For phrasing that those rules cannot confidently parse, the original words become an editable draft task without an inferred person, date or clock time. The review screen explicitly labels that case. Users can choose the person, action type, date and optional alert. Full speech remains in the conversation even when a long draft title is capped at 500 characters. This trades automatic inference for speed and explicit review; it is not a claim that arbitrary Tamil speech can always be interpreted correctly. A bare Tamil or English 1–12 clock without a period offers AM/PM choices; explicitly saying morning/afternoon or AM/PM resolves it.

Follow-ups can have a date without a clock time, or no date. An explicit 5 a.m. without a day now uses the next occurrence rather than a past time. Explicitly stated past dates remain visible for review. Existing actions are not converted or rescheduled automatically. Timed actions retain their individual notification path.

Each Settings card has its own save button and scoped endpoint, so saving voice, Sheets, daily summaries or reminder preferences does not overwrite another section's draft.

### Daily follow-up summary deployment

1. Before deploying this version, run `supabase/daily-summary-migration.sql` in the intended Supabase project's SQL Editor. It adds summary preferences and per-account delivery leases; it does not change action dates or existing alert state.
2. Run `supabase/daily-summary-check.sql`. It verifies scheduling, counts, permissions and duplicate protection using disposable fixtures, then rolls everything back.
3. Deploy the web/backend together. `STT_LANGUAGE=auto` is the supported deployment setting; PWA audio requests also explicitly request automatic detection.
4. Verify the existing reminder cron is active (`supabase/reminder-cron.sql`), VAPID is configured, and the device has granted notification permission. No new cron is needed when the existing five-minute job already runs. A custom 7:03 time can therefore deliver around 7:05; push/device delivery itself is not guaranteed at an exact minute.
5. In Settings, choose **Daily follow-up summary**, default **07:00 IST**, or a custom time, then save. Both the daily-summary toggle and push-reminder toggle must be enabled. The summary includes pending untimed follow-ups for today, overdue follow-ups and undated follow-ups; future tasks, completed tasks and timed appointments are excluded. Empty lists do not send a push. Delivery claims prevent overlapping cron calls from repeatedly sending the same daily summary; failures can retry after a lease expires. A stable notification tag also groups retries if delivery succeeds but acknowledgement is interrupted.
6. On a test account, verify a date-only follow-up saves without a time, appears on the right day, and joins the daily summary. Verify an existing timed appointment still alerts independently. Record the Arumugam example on the actual target device and check both the preserved words and Stop-to-review readiness.

New native UI behavior and native daily summaries are deferred to the next Android/iPhone rollout. The existing shared extraction API remains available to native clients; its Gemini default is now the tested `gemini-3.5-flash-lite` with a validated JSON contract and an explicit timeout. The old default returned HTTP 404 for the local benchmark key. Test native clients separately before their next release.

### Voice latency evidence

- `npm run benchmark:voice` executes the actual before/after VoiceCapture lifecycle with simulated 40 ms local storage, 900 ms audio transcription and 350 ms server extraction. It measures draft-data readiness, not DOM paint, human tap delay or real microphone/network performance. The latest controlled sample was approximately **1.29 s before / 0.27 s after**, with **zero second-transcription requests** on the live-text path. See `docs/voice-review-controlled-benchmark.json`.
- Warm local parsing of the Arumugam example was approximately **0.08 ms median / 0.21 ms p95**. A cold first parser call was also included in the component timings.
- Separate real Gemini text requests took **5.3 s**, **8.5 s**, and **9.9 s** in individual probes; these are not audio timings or a distribution. That is why mandatory AI inference cannot underpin a reliable 2–3 second review target. See `docs/voice-review-provider-benchmark.json`.
- The 2–3 second target still needs a deployed physical-device check. Browsers without live speech must wait for the audio provider and cannot inherit the live-text fast-path guarantee.
- Client logs `recall_voice_timing` and `recall_review_timing`, and the audio endpoint's Server-Timing header, contain durations/source only, never spoken text, audio, names, credentials or account IDs.

Validation commands: `npm run test:voice`, `npm run test:daily-summary`, `npm run test:extract`, `npm run test:writes`, `npm run test:security`, `node --experimental-strip-types scripts/test-startup-guards.mjs`, and `npm run build -- --webpack`. Fixtures are isolated; live probe timings are documented separately. Actual device audio accuracy, cron activation and push delivery require deployment/device validation.


### Follow-up phone feedback corrections

The phone-reported “Tomorrow I have meeting with Karthikeyan sir, set me a call at 2:00 PM” now becomes a meeting on the next day at 14:00 IST. “நாளைக்கு 3 மணிக்கு ஆரியப்பன் கூட ஒரு மீட்டிங் இருக்கு ஸ்கெடியூல் பண்ண” retains the Tamil name and meeting type and offers next-day 03:00/15:00 choices, because AM/PM is absent. Choosing 15:00 is covered by the actual ReviewDue component test. Adding “மதியம்” resolves it directly to 15:00. Clock-free meetings retain their date and do not invent a clock time. The recorder no longer shows an extra re-transcription button, and its elapsed duration remains visible after Stop.

Groq's default is now `whisper-large-v3` rather than Turbo for the audio fallback. If Vercel explicitly sets `STT_MODEL`, update that variable to select the full model; explicit configuration remains respected. This is a quality/latency/cost tradeoff, not a promise to recognize every name correctly (see https://console.groq.com/docs/speech-to-text). Gemini's configured model is unchanged. The transcription endpoint no longer sends the first 50 saved contacts as name hints: bad saved spellings can bias recognition and unrelated names should not be introduced. Explicit server vocabulary configuration is still supported. These changes do not establish that the phone's “Aarmugam” recognition is fixed; the original recording or another real-device recording is needed to verify that.

Duration logs now serialize their timing fields as JSON so browser diagnostics can read the numeric values without logging speech or credentials. No database migration is required for these phone-feedback corrections.


### Stop-time transcript protection

The reported “correct Arumugam while speaking, Aarmugam after Stop” case was reproduced in the prior VoiceCapture component: calling the browser recognizer's stop method could emit a different final result before the saved text was committed. The recorder now snapshots text before stopping recognition, rejects later rewrites while accepting a matching final suffix, and does not call the audio API when that snapshot exists. If live text arrives while a no-preview fallback request is already in flight, the live result is committed once and the client request is aborted/discarded. Recording-generation guards prevent old callbacks or responses from applying after a new recording, Clear, or an owner change. Timing and model/accuracy claims remain separate: this prevents a later rewrite of already-correct visible text; it cannot fix a name that was initially misheard.

`npm run test:voice-stop` replays actual component callbacks, reproduces the old overwrite, and verifies both synchronous and delayed finalization, fallback interruption, late responses that ignore cancellation, no-live fallback, and obsolete recording events. No microphone or real provider is used in that regression test. No new database migration is needed.
