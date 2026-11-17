# Web/PWA performance rollout — 17 November 2026

## Deployment scope

This rollout changes only the shared backend and adds measurement tooling.
Existing settings reads avoid unnecessary writes, independent settings/count
reads overlap, dashboard skips unused settings work, and save/update responses
include numeric timing stages. API response bodies remain compatible.

Merge the source commit from `mjsan-dosclub/recall` into the deployment repository
`touchmarkdescience/recall`, then deploy that revision to the existing Vercel
production project. No database migration or environment-variable change is needed.
Confirm Vercel's deployed revision includes this commit before testing.

The PWA frontend, service worker, push dispatch, authentication policy and reminder
calculations are unchanged. Installed native apps also use this backend and will
benefit from fewer server requests. Flutter's parallel startup and local confirmed
status updates are separate local changes, excluded from this rollout. No Android
or iPhone binary is built or uploaded here.

## Measurement evidence

Production-built HTTP routes were tested against a loopback-only PostgREST fixture
with 50 ms delay per database request; values are medians of seven warm samples.

| API operation | Before | After | Database requests before → after |
|---|---:|---:|---:|
| Save | 434.7 ms | 224.4 ms | 8 → 5 |
| Update | 546.9 ms | 332.7 ms | 10 → 7 |

These are synthetic API timings, not measured production or whole-PWA timings.
Raw reports are in `mobile/release/save-performance-{before,after}.json`.
Their combined refresh/workflow figures model the Flutter changes and must not
be presented as PWA results. Real network, cold starts, Supabase execution,
browser rendering, notification delivery and connected Sheets remain unmeasured.

Reproduce the after checks with `npm run build`, then
`node scripts/benchmark-save.mjs after`. Ports 3375/3376 must be available.
The label does not change server code; the before report used the previous code.
The harness uses synthetic records and does not write to production.

## PWA acceptance checklist

Use a test account. Keep the same device, network and similar task count when
comparing. Record the first request after inactivity separately from five warm
attempts. If possible capture the old deployment's timings before deploying.

1. Close and reopen the installed PWA while online. Sign in and confirm Today,
   Actions and People load correctly.
2. Save a manual action, then a spoken note through Review. Time Save tap to
   visible success. Reload and verify the title, person, due time and independent
   reminder time persisted exactly once.
3. Edit the action title and due/reminder times. Time Save tap to success; reload
   and confirm the persisted values. Mark another action complete and confirm it
   remains completed after reopening the PWA.
4. With browser notifications allowed, schedule a near-future test reminder.
   Verify delivery with the PWA closed, then verify a completed action does not
   produce a later reminder. PWA delivery depends on the existing server push
   setup; native offline alarms are a separate device test.
5. Disconnect the network and attempt an edit/save. Confirm no false success is
   shown and entered text remains available for retry. Reconnect and retry, then
   check for duplicates.
6. Check Settings and existing sign-in/sign-out. If Sheets is connected, confirm
   export still succeeds; disconnected users retain queued events as before.

For each Save/Update, browser Network tools show the `Server-Timing` response
header. Vercel logs contain `recall_write_timing` with `authMs`, `writeMs`,
`postWriteMs`, and `totalMs`. These durations exclude the subsequent dashboard
refresh and browser rendering. Do not share cookies, authorization headers or
account content in diagnostic captures.

Proceed to new Android/iPhone builds after PWA checks pass. Native notification
completion, five-minute snooze, rescheduling and sign-out cancellation still need
physical-device regression checks on those new builds.
