# PWA live verification after fast-write deployment

Date: 17 November 2026, Asia/Kolkata.
Target: https://recall.touchmarkdes.com/app
User confirmed both SQL scripts succeeded and the source changes were merged and
redeployed. The page was reloaded before testing. Live behavior matches the new
background-completion flow; the deployed Git SHA and Server-Timing stages were
not independently inspected through the browser tool.

Environment: authenticated in-app browser at a mobile-size viewport. This is not
an installed Android/iPhone PWA or a physical notification-delivery test.

## Passed checks

1. Existing account/session and dashboard data loaded after reload.
2. Saved a labelled action under the existing Anand contact for 18 November at
   2 PM IST, with a 30-minute reminder. Details showed 1:30 PM correctly.
3. Edited its title, due time to 5 PM and offset to one hour. Reloaded and reopened
   details: title, 5 PM due time and 4 PM reminder were retained.
4. Tapped Complete in the detail sheet. The sheet closed while the request was
   pending, with polite `Saving 1 update… You can keep working.` feedback. People
   navigation worked before the `Marked complete` confirmation appeared.
5. Reloaded: completion count remained incremented.
6. Saved a labelled Guest action with date-only timing. Tapped Complete on the
   dashboard: the active card disappeared while saving was pending. Calendar
   remained usable before confirmation.
7. Reloaded and filtered Completed: both test actions appeared once with Reopen
   controls, with no pending state or failure notice left behind.

Existing user actions were not edited. Total action count changed from 41 to 43;
completed count changed from 40 to 42. Both new test actions are completed:

- `PWA live release verification — edited and confirmed` (Anand)
- `PWA live release verification — Guest completion` (Guest)

Their test notes remain as evidence. Completing them prevents these test actions
from qualifying as pending reminders under the existing dispatcher rules.

## Observed UI timing

| Operation | Automation-observed duration |
|---|---:|
| Linked action save to card visible | 3,030 ms |
| Guest action save to card visible | 2,119 ms |
| Edit to successful sheet dismissal | 2,705 ms |
| Linked Complete to sheet dismissal | 974 ms |
| Linked Complete to confirmed success, including People navigation | 3,252 ms |
| Guest Complete to active-card disappearance | 2,165 ms |
| Guest Complete to confirmed success, including Calendar navigation | 4,207 ms |

These timers surround automation calls and include browser-control overhead,
network, backend and UI work. Removal/dismissal samples do not measure React event
or frame latency. What was directly verified is that removal/dismissal and
navigation occurred **before server confirmation**, while the pending status was
still visible. Completion-confirmation timers also include intervening navigation
and inspection operations, so they must not be reported as isolated API latency.

Earlier pre-patch observations were about 7.0 seconds for linked Save and 6.1
seconds for Edit. The new observations suggest improvement, but are single samples
from different moments, not a controlled repeated before/after production study.
The local 116/114 ms API benchmark is separate and must not be substituted for
these live UI results. Live stage logs and function/database region inspection
remain the next step for explaining the remaining 2–3-second visible save/edit
wait.

## Limits and follow-up

- No forced failure was injected into production. Rollback and retry passed in
  the isolated delayed/failing fixture during implementation.
- Physical installed-PWA notification delivery, closed-app push, microphone
  transcription, offline behavior and signup/logout were not exercised here.
- Reminder-time persistence passed; this is not proof of actual alert delivery.
- Before native releases, verify phone PWA notifications and then test new native
  builds for reminders, completion, snooze and sign-out cancellation.

Screenshot: `/private/tmp/recall-pwa-live-fast-writes-verified.jpg` (temporary local
evidence file). No new application code or production configuration was changed
during this verification.
