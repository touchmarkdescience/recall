# Recall save/update performance review — 17 November 2026

## Scope and evidence

Firebase remains on hold. No AI provider, speech recognizer, authentication policy,
database schema, reminder offset, scheduling algorithm, snooze behavior or
notification payload was changed. This report was captured before deployment/packaging. The later iPhone
1.0.8 (15) candidate includes these Flutter changes; see IOS-1.0.8-build15.md.
Existing build 14 does not contain them. The shared backend has since received
further improvements documented in docs/PWA_FAST_WRITES_RELEASE.md.

Measurements use the real production-built Next.js HTTP routes against a
loopback-only, in-memory PostgREST fixture with **50 ms delay per database request**.
Each number is the median of seven warm samples after a warm-up. No production
records, real account credentials, Google assessments or external AI calls are
used. These numbers are not physical-phone timings and do not measure Supabase
query execution, mobile networks, cold starts, OS scheduling, rendering, or a
configured Google Sheets export. There is no claim that the reported 5–10 second
phone delay is now a particular measured number.

Raw results: `save-performance-before.json`, `save-performance-after.json`.
Harness: `scripts/benchmark-save.mjs`. The labels select the corresponding mobile
HTTP workflow; they do not switch server code. The before result was captured
before the server edits. To reproduce an after run, build the current backend
and run `node scripts/benchmark-save.mjs after` with ports 3375/3376 available.

## Before/after

| Measured work | Before | After | Reduction |
|---|---:|---:|---:|
| Save API | 434.7 ms | 224.4 ms | 48% |
| Account + dashboard HTTP refresh | 608.7 ms | 170.5 ms | 72% |
| Save + HTTP refresh workflow | 1044.9 ms | 398.9 ms | 62% |
| Status update API | 546.9 ms | 332.7 ms | 39% |
| Status update + former blocking HTTP refresh | 1146.6 ms | 332.7 ms | 71% |
| Database requests per Save | 8 | 5 | 3 fewer |
| Database requests per Update | 10 | 7 | 3 fewer |

Save still awaits dashboard application, notification-action reconciliation and
the phone's reminder sync before the review screen reports success. Their real
device time is not included in the table. Status updates retain the existing
immediate hide/persist/retry behavior and reminder-sync calls; a confirmed local
status is applied without waiting for a second dashboard fetch.

## Screen-by-screen mobile review

"No API on open" describes the current code path; it is not a measured 0 ms UI
render time. Screen API probes below are after-change measurements with the same
50 ms synthetic database latency. They are not whole-screen timings.

| Screen or operation | Current wait / measured API portion | Optimization review |
|---|---|---|
| Splash / authenticated launch | Identity 163.9 ms, dashboard 166.6 ms; together refresh median 170.5 ms. Secure storage, app startup and reminders unmeasured. | Independent account/dashboard calls now overlap; both must succeed before displaying an account. Keep fresh authentication and notification reconciliation. |
| Onboarding sliders | Local widgets; no API on slide change. Rendering unmeasured. | Low priority. Do not insert artificial minimum splash delays. |
| Sign in | Login request, then account/dashboard and reminders. Login and whole-screen time unmeasured. | Measure password verification/auth queries separately before changing auth. Refresh portion benefits from this change. |
| Create account | Security config, native Google SDK preparation/assessment, registration, then startup. Unmeasured. | SDK already prepares when signup mode opens. Keep fresh proof and all server checks; no CAPTCHA bypass for speed. |
| Today | Uses loaded account/actions. Opening tab has no additional API. Pull-to-refresh HTTP portion 170.5 ms. | Remove duplicate requests; retain explicit refresh and notification updates. At larger volumes, paginate relevant task data. |
| Actions / filters | Local loaded actions; no API just to switch tab/filter. Render time unmeasured. | Status acknowledgement no longer waits for a full dashboard reload. Check frame time with a large real task list before changing card rendering. |
| Mark completed / archive | Status API 332.7 ms; phone storage/cancellation time unmeasured. | Persist pending update before POST; apply confirmed status locally. Failed requests still roll back and reminders are reconciled. |
| People list | Local loaded contacts; no API on open. Render time unmeasured. | If lists become large, add search/pagination and lazy rendering rather than reload all records. |
| Person profile / timeline | Existing action cards are local; timeline API 219.5 ms with a small fixture. | A Future is currently created during build, so rebuilding can refetch the timeline. A retained Future and explicit refresh are sensible next steps. History queries are not paginated. Not changed in this save-focused patch. |
| Guest history | Uses dashboard endpoint; API portion 166.6 ms for a small fixture. | A dedicated paginated guest-history endpoint could avoid reloading unrelated records. Not implemented here. |
| Speak / live words | Phone speech engine and permissions; no Recall transcription upload. Recognition startup/accuracy unmeasured. | Measure on a physical phone. Changing Gemini configuration does not change this recognizer. |
| Stop & Review | Waits for final speech result, then extraction API. Native stop has a 2.8 second final-result timeout; that is a configured bound, not a measured typical wait. | Preserve final-word handling: shortening it blindly risks losing words. Measure recognizer finalization separately from API extraction. |
| Review / edit transcript | Rule-based extraction API portion 166.3 ms for the sample phrase. Field editors are local. | AI fallback, when enabled, has a different latency and requires separate measurements. Keep ambiguous time confirmation and person correction. |
| Manual entry / date and reminder editors | Local until Save; render time unmeasured. | No AI should be called for already-entered values. Keep independent reminder times and validation. |
| Save / edit action | Save 224.4 ms or update 332.7 ms, followed by required account/reminder work. | Redundant settings writes/reads removed. Save confirmation still waits for existing notification scheduling, not a fabricated optimistic success. |
| Task detail sheet | Uses loaded action data; no API on open. Render time unmeasured. | Keep detail presentation local. Persist only when editing/completing. |
| Mobile Settings | Uses local notification state and OS permission APIs. No backend request just to open. Unmeasured. | Do not weaken permission checks for speed. The companion web settings API separately measured 164.1 ms. |
| Logout / delete account | Backend request plus local session and reminder cleanup. Unmeasured. | Preserve cleanup/account isolation. Do not show deletion success before database confirmation. |

## Changes implemented

- `src/lib/cloudSettings.ts`: existing settings reads no longer upsert every time;
  independent settings/count reads run concurrently; missing rows still initialize
  once with database defaults. Disconnected Sheets checks no longer reread and
  rewrite the full settings record. Connected export behavior and durable outbox
  events remain in place.
- `src/lib/cloudRoutes.ts`: `/me` reads only the transcription setting it needs;
  dashboard skips unused settings reads. Save/update JSON contracts, ownership
  filters, validation, due dates and notified-at reset behavior are unchanged.
- `mobile/lib/main.dart`: parallel account/dashboard reads; confirmed status
  updates use the current owned local record instead of a blocking full reload.
  Notification scheduling/reconciliation calls remain in place.
- Save/update responses include numeric `Server-Timing` stages. Vercel logs
  `recall_write_timing` with operation and durations only, never account IDs,
  transcripts, emails, passwords, keys or tokens. `authMs`, `writeMs`,
  `postWriteMs`, `totalMs` identify the next production bottleneck.

## Validation

- Production Next.js build and TypeScript checks passed.
- All 16 backend security tests passed.
- All 72 Flutter tests passed; Flutter analysis reported no issues.
- Tests cover parallel startup without displaying partial account data, confirmed
  updates without redundant dashboard fetches, rollback, pending updates after
  restart, offline completion/snooze, account isolation, Android/iOS notification
  actions and reminder scheduling. OS calls are mocked, not physical delivery.
- HTTP fixture checks verify missing settings initialization, retained reminder
  defaults, no writes on existing settings reads, rejection of failed writes,
  unchanged due times/reminder offsets, and stage timing headers.
- The notification scheduler and notification-action source files were not
  modified by this performance patch.

## Deployment and actual-phone measurement

1. Merge/deploy the backend changes to the existing Vercel project. No database
   migration, Firebase setup, AI key or infrastructure upgrade is needed.
2. Build new mobile versions with unused store build numbers. Existing installed
   apps benefit from backend query reductions, but require an update for the
   parallel refresh and status-update changes.
3. On a physical phone, compare time from Save tap to confirmation and Update tap
   to confirmed status on the old/new versions using the same account, network
   and comparable task counts. Measure the first request after inactivity
   separately from warmed requests. Record the app version and device/OS.
4. Inspect `recall_write_timing` logs for database versus post-write overhead.
   Confirm Vercel function region is near the Supabase region; neither live
   region was verified or changed in this patch. Do not buy an upgrade solely
   on the assumption that the free plan caused the delay.
5. Recheck reminder/meeting/follow-up alerts with the app closed, completion,
   five-minute offline snooze, due-time edits, and sign-out cancellation before
   release. Physical-device regression checks on this patch remain pending.
