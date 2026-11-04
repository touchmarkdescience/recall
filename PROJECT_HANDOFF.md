# Recall — development handoff

**Status:** Live, open for testing as of 4 November 2026 (IST). This document describes the implementation in `mjsan-dosclub/recall` at commit `130d4d9` and the deployment completed from that code. It is intended for developers and testers; it contains no secret values.

## 1. Purpose and users

Recall is an iPhone-first sales follow-up PWA. A salesperson can capture what was said in a conversation, who it was with, and what they promised to do next without taking notes during a busy day. The app should make today's commitments visible as soon as the user signs in, preserve each person's history, and remind only the account that owns the action. English is the main spoken language; Tamil and mixed English/Tamil audio are supported by the transcription path.

The central example is a call today in which the salesperson promises to give a team information this evening or tomorrow. Recall records the conversation and the due action so the salesperson can recover the context later. It supports voice notes, typed notes, and manual follow-up entry. There are no billing, payments, pipeline targets, or currency fields yet. If money fields are added, use INR.

## 2. Links, repositories, and deployment ownership

| Item | Location / state |
| --- | --- |
| Live app | <https://recall-six-azure.vercel.app/> |
| Source repository for this handoff | <https://github.com/mjsan-dosclub/recall> (`main`) |
| Vercel project | <https://vercel.com/mj-san-personal/recall> |
| Repository connected to Vercel | `touchmarkdescience/recall` |
| Supabase project | <https://jwhgbzdepxoskdzbtxnb.supabase.co> (project reference `jwhgbzdepxoskdzbtxnb`) |
| Google Sheet example | <https://docs.google.com/spreadsheets/d/1qsNsyJ2FLXJE1pjEDOkvRAZbICWsazDzAAUSy_ZutPw> |

**Repository workflow:** Keep the two GitHub repositories separate. Changes are pushed to `mjsan-dosclub/recall`; the owner will manually merge them into `touchmarkdescience/recall`. Vercel is connected only to the Touchmark repository for subsequent Git deployments. The current live build was deployed directly with the Vercel CLI from the source workspace, so the Touchmark repository may temporarily be behind the live build until that manual merge. Do not reconnect Vercel to `mjsan-dosclub/recall` or assume pushing there triggers Vercel.

The production Supabase database was initialized with the Recall schema, **without copying localhost accounts, contacts, notes, or password hashes**. New live users must create accounts. The user explicitly chose an empty live start.

## 3. Implemented user experience

1. **Account:** Register with name, email, and a password of at least eight characters; sign in and out. Data is tied to the signed-in account. The UI is light, mobile-first, and uses the same visual system from landing through settings and sign-out.
2. **Home / today:** The home screen defaults to **Today**. Tappable boxes show All, Today, Overdue, Upcoming, and Completed counts, with the selected list on the same page. Today's cards are highlighted. Search filters the visible cards. When nothing is due today, the screen says, “You have time to meet your next prospect.”
3. **Quick entry:** On the home screen, add a follow-up title, choose an existing person or enter a new one, and choose a date and optional time. A full manual entry screen also supports follow-ups/callbacks, reminders, meetings, context, and meeting duration. Both routes save a person-linked interaction and action.
4. **Voice capture:** Tap the microphone to start, then the square icon to stop. The waveform responds to microphone level while recording, and the timer/status change. The recording is saved to IndexedDB on that device before automatic server transcription. The UI shows interim browser speech text when that browser supports it; the final transcript comes from the configured server transcription provider. No audio playback player is shown. The user can type or correct the transcript if capture or transcription fails.
5. **Review:** The user checks the transcript, conversation time, contact match/new contact, summary, and every proposed action before saving. The selected existing contact is editable. More actions can be added or removed. The conversation time cannot be in the future. Follow-up/meeting due times may be in the future; a timed due time already past is rejected.
6. **Person profile:** A contact has a timeline of conversation summaries and original note text, plus a board for Action to take (meetings/reminders), Follow-ups, Completed, and Archived. Actions can be completed, reopened, rescheduled, archived, or marked removed. “Removed” is a status retained in storage, not a hard delete.
7. **Calendar:** Month view on mobile; day, week, and month views on desktop. Desktop meetings occupy a block proportional to their saved duration. Times are shown in IST. The desktop time grid spans 7 a.m. to 9 p.m.; verify behavior for events outside that range before relying on the visual duration view.
8. **Ask Recall:** Ask across all people or within one person. It returns the latest saved conversation and pending actions from that account's records. The current production answer mode is **Local summary**; the API has a separately configurable OpenAI answer mode.
9. **Settings:** A per-account reminder switch and one lead-time choice for dated actions (at due time; 15, 30, or 60 minutes before; or one day before). Each device must separately enable notifications. Settings also hold that account's Google Sheet URL and shared secret, display pending Sheet events, and offer retry and instructions.
10. **Navigation/PWA:** Screen selection is reflected in the URL hash, so refresh generally returns to Home, Calendar, People, the selected person, capture, manual entry, Ask, Settings, or the Sheet guide. Manifest, icons, service worker, and mobile bottom navigation are included.

### Visual system and interaction priorities

The design brief calls for a pleasant, light theme across the entire app, including landing, authentication, buttons, links, alerts, forms, calendar, and sign-out. The current shared CSS uses cream/white surfaces, mint and deep green accents, rounded cards, clear focus states, and an Inter/system font stack in the final visual layer. The home page is compact and mobile-first; the earlier date/name top bar and the home-page “your relationships” section were removed to reduce scrolling. Summary boxes open lists on the same page. The date picker is custom and theme-aligned across quick entry, manual entry, review, and rescheduling; avoid replacing it with the default browser datetime input without a design review. The recording waveform must remain animated by live microphone level, with the mic changing to Stop while recording. Do not add an audio playback player to the capture screen without product approval.

## 4. What is real, what is a fallback, and what remains unverified

| Capability | Current production state |
| --- | --- |
| Account storage, contacts, interactions, actions, settings, sessions | **Real** Supabase Postgres storage via server routes. Local development uses SQLite when Supabase variables are unset. |
| Audio recording | **Real** browser microphone capture. On iPhone the app uses Web Audio and 16 kHz mono WAV; other browsers use MediaRecorder where available. One latest clip per account is kept in that browser's IndexedDB; it is not synced to other devices. |
| Final transcription | **Real** Google Gemini API is configured in production. It is the Gemini API, not Google Cloud Speech-to-Text. Audio is sent to Gemini after local save. English, Tamil, and mixed-language accuracy requires real-device testing. |
| Interim words while speaking | Browser SpeechRecognition preview **where supported**. It is currently initialized with `en-IN` in the UI, may use the browser vendor's speech service, and is not the Gemini final result. Tamil speech should be judged by the final Gemini transcript, not the preview. |
| Contact/action extraction | **Local rules in current production.** An `OPENAI_API_KEY` enables the optional AI extractor. Local rules can miss Tamil instructions, ambiguous names, dates, multiple actions, or conversational commitments. Review is mandatory. Gemini transcription alone does not enable AI extraction. |
| Contextual questions | **Local summary in current production.** Optional OpenAI mode is coded but no OpenAI production key was configured. It is not an unrestricted conversational agent. |
| Background Web Push | VAPID keys and the server dispatcher are configured; Supabase Cron calls the protected endpoint every five minutes. A manual scheduler call returned HTTP 200 with an empty queue. **Actual push delivery to an installed iPhone or Android device has not been verified.** |
| Google Sheet transfer and morning email | **Optional, per salesperson, not connected by default.** The app queues transcript/action events; each salesperson must deploy and connect their own Apps Script. No live Sheet sync or 8 a.m. email is active until that setup is completed. |
| Authentication | Real custom email/password and session implementation. It is **not Supabase Auth**; there is currently no email verification, password reset, team roles, SSO, or admin console. |

Do not market a feature as tested end to end merely because credentials or a scheduled job are configured. The live API and scheduler were checked, but a production user registration plus actual voice, push, and Sheet flows still need device/account acceptance tests.

## 5. Architecture and data flow

```text
Mobile/desktop browser (Next.js client + service worker)
  ├─ audio clip → IndexedDB on this device → /api/transcribe → Gemini → editable transcript
  ├─ transcript → /api/extract → local rules or optional OpenAI → editable review
  ├─ confirmed note/actions → /api/save → Supabase RPC → contact + interaction + actions + Sheet outbox
  ├─ dashboard/profile/calendar/Ask → account-scoped API reads
  ├─ per-device PushSubscription → account-scoped API storage
  └─ Sheet settings → queued event POSTs to that account's Apps Script webhook

Supabase pg_cron (every five minutes)
  → pg_net + Vault cron key → GET /api/cron/dispatch on Vercel
  → eligible account subscriptions → Web Push → service worker notification
```

### Code map

| Area | Files |
| --- | --- |
| Main UI, account state, navigation, review, Ask | `src/components/App.tsx`, `src/app/page.tsx` |
| Home summary cards and quick entry | `src/components/SalesDashboard.tsx` |
| Audio, local IndexedDB, iPhone PCM/WAV | `src/components/VoiceCapture.tsx`, `src/lib/localAudio.ts`, `src/lib/pcmCapture.ts` |
| IST picker, manual entry, calendar, contact board | `src/components/IstDateTimePicker.tsx`, `ManualAction.tsx`, `CalendarWorkbench.tsx`, `ContactKanban.tsx` in `src/components/` |
| Reminder/Sheet settings and instructions | `src/components/ReminderSettings.tsx`, `src/components/SheetGuide.tsx` |
| API routing, custom auth, extraction | `src/app/api/[...path]/route.ts`, `src/lib/auth.ts`, `src/lib/extract.ts` |
| Production Supabase adapter and Sheet outbox | `src/lib/cloud.ts`, `src/lib/cloudRoutes.ts`, `src/lib/cloudSettings.ts` |
| Local SQLite adapter | `src/lib/db.ts`, `src/lib/settings.ts` |
| Transcription endpoint and prompts | `src/app/api/transcribe/route.ts`, `src/lib/transcription.ts` |
| Production push endpoint and scheduler SQL | `src/app/api/cron/dispatch/route.ts`, `supabase/reminder-cron.sql` |
| Database schema | `supabase/schema.sql` |
| Google Apps Script and downloadable copy | `integrations/RecallSheet.gs`, `public/RecallSheet.gs` |
| PWA and theme | `public/manifest.webmanifest`, `public/sw.js`, `public/icon*`, `src/app/globals.css`, `sales.css`, `unified.css` |

### Data model

Production tables are `recall_users`, `recall_sessions`, `recall_contacts`, `recall_interactions`, `recall_actions`, `recall_push_subscriptions`, `recall_user_settings`, and `recall_sheet_outbox`. Every contact, interaction, action, subscription, setting, and outbox event carries a `user_id` or is linked to the owning user. An interaction has its transcript, summary, contact, and `occurred_at`. An action has type (`follow_up`, `reminder`, `meeting`), title, optional `due_at`, optional time flag, meeting duration, status (`pending`, `done`, `archived`, `removed`), and `notified_at`.

`supabase/schema.sql` enables row level security on all Recall tables without browser access policies. The browser never receives the Supabase secret key. Vercel server routes use that key and check the current session user on account data requests. The `recall_save_note` SQL function writes the contact (if new), interaction, actions, and Sheet outbox events atomically, and checks that a selected contact belongs to the user. The service key bypasses RLS, so route-level ownership checks and careful server-only key handling are essential. Sheet webhook secrets are stored in the account settings table; production secret encryption/rotation and access review should be considered before wider rollout.

Sessions use an HTTP-only, SameSite=Lax cookie, Secure in production, with a 30-day expiry. The database stores a SHA-256 hash of each random session token. Passwords use salted `scrypt` hashes. This is a custom auth system; it is not tied to Supabase Auth users.

## 6. Dates, reminders, and notification semantics

- All persisted action/conversation timestamps are UTC instants; input and display use `Asia/Kolkata` (IST).
- The themed picker offers Today, Tomorrow, In 2 days, a month calendar, 9 a.m./2 p.m./5 p.m., custom time, and Any time for due dates. Conversation-time mode offers Today, Yesterday, and 2 days ago, and blocks future conversation timestamps.
- A date-only due action is represented at **9:00 a.m. IST**, with `time_specified = 0`. It remains labeled “Any time” in the UI, but its reminder calculation uses that 9 a.m. instant. No due date means no scheduled push.
- Relative phrases such as “in 4 hours” are interpreted against current IST by the local parser. The user should inspect extracted dates, especially ambiguous speech and Tamil instructions.
- Supabase Cron job `recall-dispatch-every-five-minutes` is active with schedule `*/5 * * * *`. It reads `recall_cron_secret` from encrypted Supabase Vault and calls the protected Vercel route. The key is not committed to the repository. The dispatch route selects due, pending, unnotified actions with push enabled, sends only to subscriptions owned by that action's user, and marks `notified_at` after successful delivery. Invalid subscriptions (HTTP 404/410) are removed.
- A five-minute check is **not an exact-minute guarantee**. Network, platform timing, browser/OS notification policy, or an uninstalled iPhone PWA can delay or prevent delivery. There is no SMS fallback. Users must enable push on each device; on iPhone, install the PWA to the Home Screen over HTTPS first.
- The service worker opens the app when a notification is tapped. The current foreground browser-notification fallback runs only when VAPID push is **not** configured; production relies on the subscription and Web Push path. If a device has not subscribed, it should not be assumed to get a foreground alert just because the tab is open.

## 7. Google Sheets and 8 a.m. email setup

Each salesperson uses a separate copy of the example Sheet, not a shared company-wide Sheet. The app guide is **Settings → How to connect your Sheet**. The server queues interaction/action events even before a Sheet is connected, then retries queued updates when a valid connection is saved or when the user taps Retry. `Processed Events` deduplicates event IDs; action rows update in place on completion/rescheduling. Only text transcript, summary, action, dates, and status are sent; the original audio stays in browser storage.

For each user's copy:

1. Open the example Sheet, choose **File → Make a copy**, and open **Extensions → Apps Script**.
2. Paste `integrations/RecallSheet.gs` (also downloadable from the app). Set the script time zone to **Asia/Kolkata**.
3. Add Script Properties `RECALL_SECRET` (random, at least 16 characters) and `DIGEST_EMAIL` (recipient). Run `setupRecall` once and authorize Google's Sheet/Mail permissions.
4. Deploy as a Web app, **execute as the Sheet owner**, accessible to **Anyone**, and copy the `/exec` URL. The script checks `RECALL_SECRET` in each POST; protect and rotate it. Anyone access is necessary for the server POST but is a deliberate exposure choice.
5. In that user's Recall Settings, enter the URL and same secret, save, check queued count, and retry if needed.

The script creates **Conversations**, **Actions**, and **Processed Events** tabs and a daily time trigger around 8 a.m. IST. It emails pending actions due that day; if none are due, it says the user has time to meet the next prospect. Google Apps Script's trigger does not promise delivery at precisely 8:00. A user's Sheet connection and email are not automatically provisioned by Vercel or Supabase.

## 8. Local development and configuration

Use Node.js 24 or later and npm. In the repository root:

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open <http://127.0.0.1:3000/> (or the port printed by Next.js). With `SUPABASE_URL` and `SUPABASE_SECRET_KEY` unset, local data lives in `data/recall.sqlite`; this is separate from production and is not committed. To exercise the production adapter locally, configure both Supabase variables intentionally and use a non-production project if possible. Never paste production secret values into issues, chat, screenshots, or commits. `npm run typecheck` and `npm run build` are the available code checks.

Optional local variables and their effects:

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY`, `GEMINI_TRANSCRIPTION_MODEL` | Gemini final audio transcription (default model in code: `gemini-3.5-flash-lite`). |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | Optional AI extraction and Ask answers; OpenAI transcription is used only if Gemini is absent. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web Push key pair and sender identity. The `NEXT_PUBLIC_` value is intentionally browser-visible; the private key stays server-only. |
| `CRON_SECRET` | Bearer authorization for the push dispatcher. |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | Production cloud storage; the secret key stays server-only. |

For local background push tests, run `npm run dev:dispatch` in a second terminal; it calls local `PUT /api/dispatch` each minute with the cron secret. The production scheduler instead calls `GET /api/cron/dispatch` every five minutes. `SUPABASE_URL` + `SUPABASE_SECRET_KEY` are required in production: the API returns 503 if production is misconfigured rather than using Vercel's ephemeral filesystem.

## 9. Production setup and safe change process

1. Merge reviewed source changes from `mjsan-dosclub/recall` into `touchmarkdescience/recall` when ready. Keep Vercel's Git connection on the Touchmark repository. Confirm the `main` branch and deployment status after merging.
2. Keep `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `GEMINI_API_KEY`, `GEMINI_TRANSCRIPTION_MODEL`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, and `CRON_SECRET` in Vercel **Production** environment variables. `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is public/config. `OPENAI_API_KEY` is currently absent in production, so extraction/Ask use their local fallback. Redeploy after changing production variables.
3. Apply `supabase/schema.sql` to a new Supabase project before its first deployment. The supplied live project has already had it applied. Do not rerun destructive schema changes without a migration review.
4. For the supplied live project, Supabase Vault has `recall_cron_secret`; `pg_cron` and `pg_net` are enabled; and `supabase/reminder-cron.sql` has been applied. The active job is the only production push scheduler. The Vercel daily cron was removed to avoid overlap.
5. Never move production user data from localhost or between Supabase projects without explicit owner approval. The current live project began empty by design.

## 10. API surface for developers

| Method and route | Purpose |
| --- | --- |
| `GET /api/me` | Current account and provider capability flags. |
| `POST /api/register`, `/api/login`, `/api/logout` | Custom account/session lifecycle. |
| `GET /api/dashboard`, `GET /api/contact?id=...` | Account-scoped lists and person history. |
| `POST /api/extract`, `POST /api/save` | Extract draft actions, then save only confirmed note/actions. |
| `POST /api/contact`, `POST /api/action` | Edit a person or update action status/title/due time. |
| `POST /api/ask` | Local summary or optional OpenAI answer from this account's records. |
| `GET /api/settings`, `POST /api/settings`, `POST /api/sheet/sync` | Per-account reminder and Sheet settings/outbox retry. |
| `POST /api/push/subscribe`, `DELETE /api/push/subscribe` | Account-owned Web Push subscription. |
| `POST /api/transcribe` | Authenticated audio transcription with Gemini or optional OpenAI fallback. |
| `GET /api/cron/dispatch` | Protected production push dispatcher; requires `Authorization: Bearer <CRON_SECRET>`. |
| `PUT /api/dispatch` | Local development dispatcher when running without the cloud adapter. |

Browser-facing POST and DELETE routes check same origin when an `Origin` header is present; the protected dispatcher uses its bearer secret. The production database adapter is selected when both Supabase variables exist; otherwise the local SQLite implementation is selected outside production. The API is implemented in Next.js route handlers, not a separate backend service.

## 11. Verification already done and acceptance tests still needed

**Completed on 4 November 2026:** `npm run typecheck` and `npm run build` passed. Vercel reported the production deployment ready and assigned `recall-six-azure.vercel.app`. `GET /api/me` returned HTTP 200 with `user:null`, Gemini configured, and push configured. A login attempt for a nonexistent account returned the expected 401 (this also exercised Supabase lookup). Unauthenticated dispatch returned 401. An authenticated dispatch against the empty live queue returned HTTP 200, `{"checked":0,"sent":0}`. Supabase `pg_net` manually called the same endpoint and recorded an HTTP 200 response; its Cron UI showed `recall-dispatch-every-five-minutes` active. The live landing page was opened in Safari. No localhost data was migrated.

**Not yet demonstrated end to end:** a fresh live registration/sign-in, two-account isolation, saving and completing a real action in the live database, English/Tamil voice accuracy on an iPhone, iPhone Home Screen push delivery, Android push delivery, a salesperson's Google Sheet sync, and the actual morning digest email. Use test accounts and data approved for production testing, and clean them up according to the owner's retention choice.

Suggested acceptance path:

1. Create two live accounts and ensure contacts/actions in one cannot be viewed or changed from the other.
2. In account A, record “I spoke with Priya. Call her tomorrow at 2 p.m. and send the quote Friday.” Verify the saved audio, transcript, contact, two reviewed actions, IST dates, dashboard cards, calendar, person timeline, and Ask result. Repeat with Tamil or mixed speech and manually correct extraction when needed.
3. Add a manual callback, mark it Complete, verify Completed count/profile board, reopen it, reschedule it, archive it, and inspect the calendar.
4. Install the PWA on an iPhone's Home Screen, enable alerts in Settings, schedule a near-term action, and confirm an OS push and notification click. Repeat on Android. Account for the five-minute scheduler interval.
5. Connect a separate Sheet for one account, verify Conversations/Actions rows and completion updates, then verify the next morning's email and empty-day message.

## 12. Known gaps and development priorities

1. Add proper account recovery and abuse controls before broad rollout: email verification, password reset, registration/login rate limits, monitoring, and a considered migration to a managed auth provider if needed.
2. Decide whether local-rule extraction is sufficient. It is intentionally a fallback and may miss Tamil semantics, ambiguous names, and multiple commitments. If enabling OpenAI extraction, evaluate it on real sales notes, review cost/privacy, and keep user confirmation. Gemini transcription already has a limited-output, temperature-zero JSON request; it is not proof of semantic extraction accuracy.
3. Test and harden production Web Push. Current checks verify the scheduler and endpoint, not the browser subscription or actual delivery. Consider an atomic dispatch claim/lease if multiple dispatchers or larger volume are introduced, and add visibility into failed notifications.
4. Confirm Google Sheet webhook security, secret rotation, retries, and Apps Script quotas for the intended number of salespeople. The Sheet/email feature remains a user-run setup, not a turnkey organization integration.
5. Add product decisions for team management, shared contacts, audit/retention/export, account deletion, and data recovery if the sales team needs them. The current model is private per account with no shared workspace.
6. Add focused automated tests for auth isolation, contact ownership, save/RPC transaction, status changes, IST parsing, and push dispatch before changing these core paths. Current verification was build/typecheck and limited live smoke checks.

## 13. Privacy and operational notes

- The original audio is kept locally in the browser's IndexedDB (latest clip per account), then transmitted to the configured transcription provider to produce text. It is not stored as an audio file in Recall's server database or Google Sheet. Clearing browser data can remove the saved clip. A failed transcription is retried automatically while the capture component remains mounted and the browser reconnects; the current UI does not offer a playback or explicit retry control after a page reload, even though the latest clip may remain stored.
- Saved transcripts, summaries, contact names, actions, settings, and push subscriptions are stored in Supabase production. If a user connects a Sheet, the transcript and action metadata are also sent to that user's Apps Script/Google Sheet. Browser SpeechRecognition preview, where available, may use a browser vendor's service.
- Server secrets must remain out of the repository and browser bundle. The repository includes only variable names and SQL that references the Vault secret by name.
- The live code is usable for testing now. Treat the items under “Not yet demonstrated end to end” as acceptance gates before telling the whole team that voice, push, Sheet sync, and email are fully verified.
