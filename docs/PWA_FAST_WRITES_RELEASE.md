# PWA fast writes and background completion — 17 November 2026

## What changes

- Live session/account checks use one joined request. Token hashing, expiry,
  account existence, logout revocation and cookie/Bearer support are retained;
  authentication is not cached.
- Save reuses the installed `recall_save_note` inside an additive wrapper that
  returns the committed contact, interaction, actions and export-queue count.
- Action edits lock and update the owned row and insert the Sheets outbox event
  in one database transaction. Invalid edits or outbox failures roll back the
  entire transaction. Partial patches retain fields not supplied by the caller.
- The browser merges confirmed saved records instead of waiting for a full
  dashboard reload. Failed new saves still keep the form text.
- Complete immediately updates the current active list, counts, People context
  and calendar. The details sheet closes immediately for completion. Requests
  run while users navigate to other screens; there is no blocking alert/modal.
- A polite status message says changes are saving. Success is announced only
  after confirmation. Failure restores the action and offers a nonmodal Retry;
  failures remain visible until retried or dismissed.
- Overlapping writes to different actions retain each other's changes. Duplicate
  writes to the same action are guarded. Older reads cannot undo an optimistic
  completion or a confirmed edit; account changes invalidate pending responses.
  Contact history reads invalidated by a write retry after it settles.
- Sheets delivery uses Next.js `after()` after the write response. Export events
  have already been durably committed; failure leaves them for the existing
  Retry queued updates flow. This is not a new autonomous worker/cron or an
  unawaited fire-and-forget promise. The response's pending count is the count
  at commit, before the after-response delivery attempt.

The browser's pending action state lasts for the current app session; this patch
does not add a persistent offline client queue or promise delivery after closing
the browser. The All/Completed filters continue to include completed records;
completion removes the record from active-only views.

## Reminder compatibility

Due times, time-specified flags, reminder offsets and notification-reset conditions
are preserved. Title-only edits preserve `notified_at`. Changes to status, due
instant, time-specified flag or reminder offset clear it as before. No notification
dispatch, native scheduling, notification payload, alarm, snooze or cron code is
modified. Do not treat persisted settings tests as physical notification proof.

Native apps receive compatible `ok`, `contactId`, `interactionId` and
`sheetSyncPending` fields plus new optional response fields. This release contains
no native source changes or new Android/iOS binary.

## Evidence

Benchmark uses production-built HTTP routes and a loopback PostgREST fixture,
50 ms delay per database request, seven warm samples after a warm-up. No production
accounts or Google/AI calls are used. It excludes real Supabase execution,
internet latency, cold starts, device rendering and notification delivery.

The previous patch measured Save 224.4 ms and Update 332.7 ms. This patch measured
115.9 ms for Save and 113.9 ms for Update in the final run (48% and 66%
reductions). Raw samples are in `docs/write-performance-optimized.json`.
Foreground database requests are now two per write (joined auth + transaction).
Previously Save used five and Update seven requests including synchronous export
checks. Export checks still occur, but after the response; their work is not
included in the new foreground query count. No claim of a 100–150 ms production
guarantee is made. Function/database regions were not independently verified or
changed.

Reproduce with `npm run build` then `node scripts/benchmark-fast-writes.mjs`.
The older raw reports remain under `mobile/release/save-performance-*.json`.
The original benchmark harness targets the previous source revision; use the new
harness with this source. Live before-change UI observations are separately in
`docs/PWA_LIVE_TEST_2026-11-17.md`; they cannot be compared directly to API fixtures.

Validation completed:

- Production build and TypeScript checks.
- 16 security checks plus existing extraction/date/reminder regression suite.
- `npm run test:writes`: 11 checks using in-memory PostgreSQL and the actual SQL,
  covering committed results, account isolation, invalid values, notification
  reset/preservation, partial edits, outbox failure rollback, grants, stale reads,
  concurrent local writes, account changes and rollback-only deployment check.
- HTTP fixture verifies numeric timing headers, failed writes, settings defaults,
  no unnecessary settings writes and session expiry/account-existence checks.
- Browser test: intentionally delayed completion (2 seconds) removed the active
  card before the request finished; People navigation remained available. Forced
  failure restored the action and exposed Retry. Retry succeeded and completion
  persisted after reload. The detail sheet closed before completion finished,
  and Calendar remained usable. Automation-observed bounds were 735 ms for card
  disappearance and 240 ms for detail-sheet dismissal; these include automation
  overhead, not measured React frame times. One transient success-toast wait
  missed the toast's lifetime; persisted completion and subsequent retry success
  were independently verified.

Temporary screenshot evidence: `/private/tmp/recall-pwa-rollback-test.jpg` and
`/private/tmp/recall-pwa-background-complete-test.jpg`. Browser tests use only local
synthetic records, not production accounts. Real installed-PWA notification tests
and production stage measurements remain pending deployment.

## Deployment order — SQL first

1. Open the existing Recall Supabase project → SQL Editor → New query. Run
   `supabase/write-performance-migration.sql`. It adds two service-role-only
   functions; leaves the old save function and existing tables/data in place.
2. Run `supabase/write-performance-check.sql`. It creates disposable synthetic
   rows, verifies committed records/queue/timing/account boundaries and function
   grants, then **rolls back everything**. Success should report no errors.
3. Only after both succeed, manually merge the source commit from
   `mjsan-dosclub/recall` into `touchmarkdescience/recall` and redeploy Vercel. Keep
   the existing Git connection and environment variables. New backend writes
   require these functions; do not deploy the new routes first.
4. Reload the PWA. Use labelled test actions to repeat Save, edit, Complete,
   navigation during completion, reload persistence and a near-future real push
   reminder. Complete test actions afterwards to avoid unwanted later alerts.
5. Inspect `Server-Timing` and `recall_write_timing` for warm and first-after-idle
   requests. Separately measure button-to-confirmation and immediate disappearance.
   Confirm function/database regions before changing infrastructure or plans.
6. After PWA acceptance, prepare new Android/iPhone builds and run physical
   reminder, completion, five-minute snooze and sign-out cancellation checks.

If the web release must be reverted, redeploy the previous backend/frontend
revision. The additive functions can remain installed; no data rollback or
destructive schema change is required.
