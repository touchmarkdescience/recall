# PWA production test — 17 November 2026

Target: https://recall.touchmarkdes.com/app
Environment: existing authenticated Codex in-app browser session, web app at a
mobile-size viewport. This was not an installed Android/iOS PWA test.
User reported merge/redeployment of source commit 0553bd2. The browser could not
inspect Server-Timing headers or the deployed Git revision; neither was independently
confirmed. UI timings below do not establish which server revision handled them.

## Results

- Reloaded Settings, dashboard, person profile and action board successfully.
- Created Guest action `PWA performance test 17 Nov — verify save and update`,
  due 18 November 2026 at 2 PM IST, reminder 30 minutes before.
- Marked Guest action completed, reloaded and verified it remained completed.
- Created action under existing Anand contact, labelled
  `PWA performance test 17 Nov — linked edit check`.
- Opened its detail view: due 18 November at 2 PM, reminder 1:30 PM IST.
- Edited title to `PWA performance test 17 Nov — edited and verified`, due time
  to 5 PM and reminder offset to 1 hour. Reloaded and reopened details: the new
  title, 5 PM due time and 4 PM reminder persisted.
- Completed that action, reloaded and verified it appeared in Done. Both test
  actions are completed, with their test notes retained. Existing actions were
  not edited.

| Single observed operation | Automation-observed UI confirmation |
|---|---:|
| Guest completion to confirmed count change | 6,049 ms |
| Linked quick save to success toast | 7,001 ms |
| Edit submission to dialog closing successfully | 6,122 ms |

Timers surround browser automation click/wait operations and include automation
overhead, network, backend, dashboard refresh and rendering. They are approximate
single UI samples, not API timings, medians or a before/after comparison. Initial
Guest save was verified but not timed. No live stage-level timings were available
through the selected browser tools. The earlier localhost fixture measurements
must not be substituted for these production UI observations.

## Findings and remaining checks

Functional save/edit/completion and persisted reminder settings passed, but visible
latency remains high. The PWA still waits for a full dashboard refresh after its
write request. Source inspection also finds sequential session/user reads and
separate action read, write, contact lookup, outbox insertion and settings/count
reads. Production stage logs are needed to determine their actual contribution.

An existing limitation: Guest dashboard cards provide Complete/Reopen but no
details/edit control. Clicking the Guest title did not open a detail sheet. Linked
records can be edited through their person's action board.

Browser push delivery, closed-app notifications, offline errors/retries, microphone
transcription, login/logout, connected Sheets export and installed-PWA behavior
were not tested. Reminder settings persistence is not notification-delivery proof.
No production performance target or full release readiness is claimed.

Evidence screenshot: `/private/tmp/recall-pwa-completion-test.jpg` (temporary local file).

## Next optimization order

1. Confirm deployed revision and capture `recall_write_timing` stages plus browser
   request durations for warm and first-after-idle requests. Verify function and
   database regions before changing infrastructure.
2. Replace sequential session then user lookups with one joined query, retaining
   token-hash lookup, expiry and user existence checks.
3. Move action mutation and durable Sheets outbox event insertion into one database
   transaction/RPC, preserving ownership, validation, notified-at reset rules,
   reminder times and service-role-only access. Return the committed action.
4. Apply confirmed server results to the PWA's current dashboard state instead of
   awaiting a full reload before success. Reconcile in the background with race
   protection so an older refresh cannot undo a newer edit.
5. If Sheets is connected, process its already-durable export events with a retrying
   worker instead of awaiting third-party HTTP on the write path. Do not use an
   unawaited in-process promise as a durable job queue.

These are proposed follow-up changes, not implemented by this test. Database
indexes already exist for sessions' token hash primary key, actions by
user/status/due time and pending outbox; inspect query plans before adding indexes.
