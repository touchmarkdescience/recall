# Phone notification actions

Recall's Android and iPhone meeting, reminder, and follow-up alerts now offer
**Mark completed** and **Remind in 5 minutes**. Expand an Android notification or
touch and hold an iPhone notification to see its actions.
Both use the existing local-notifications plugin's background callback, without
opening the app. No dependency or backend API change is required.

- Completion is saved in secure storage before contacting the existing action
  endpoint. Offline completions are retried on the next authenticated app load
  or resume. Pending completions suppress further local alerts for that action.
- Snooze schedules a local alert five minutes from the tap, including when the
  original task is overdue. It does not change the task's original due time.
  Reloading or restarting Recall preserves it. Editing the due time supersedes it.
- Alerts are bound to the account that scheduled them. Signing out cancels local
  notifications and disables their actions; session credentials are never placed
  in notification payloads. Test notifications deliberately have no task buttons.
- The Android manifest registers ActionBroadcastReceiver. iOS registers the
  `recall_followup_actions` category and both actions during initialization,
  attaches the category to real alerts, and registers plugins for the background
  action engine in AppDelegate's scene-lifecycle hook.
- iPhone notification intents use device-only keychain access after first
  unlock, so locked-phone actions can persist. The login session retains its
  original when-unlocked access; completion is queued if that credential cannot
  be read. Snooze needs no server credential or network access.

## Verification

Local checks on 11 November 2026: `flutter analyze --no-pub` reported no issues;
`flutter test --no-pub` passed all 66 tests; Android `assembleDebug` passed in
23.3 seconds. APK: `build/app/outputs/flutter-apk/app-debug.apk`, built with
`RECALL_API_URL=https://recall.touchmarkdes.com`. No Play upload was performed.

After adding iOS actions, the same analyzer check passed and the full suite passed
all 70 tests. The signed iPhone release-mode build passed in 31.5 seconds
(21.7 MB), including the Swift background-plugin registration. The updated
release-mode build was installed and launched on the paired iPhone 15. The user
then confirmed both notification options work. This is user-reported device
verification; the exact connectivity/lock conditions of that button test were
not separately reported. Android physical-device button testing remains pending.

Automated tests mock the Android notification channel and secure storage. They
cover the buttons/payload, offline completion and retry, snooze after restart and
after the due time, due-time edits, scheduling errors, and account isolation.
These tests do not prove delivery or background execution on a physical phone.

Before a Play release, install the updated build and sign in to an existing
account. Opening Recall refreshes scheduled alerts with the new buttons.

The same checks apply to iPhone before an App Store release. Check both buttons
by touching and holding an alert on the Lock Screen. New iOS code requires an
updated installed build, not only a backend deployment.

1. Schedule each action type shortly ahead, close Recall, expand its alert, and
   tap Mark completed. Reopen and confirm it appears in Done on app and website.
2. Repeat offline. Reopen online and confirm the completion synchronizes.
3. Tap Remind in 5 minutes with Wi-Fi/mobile data off. Confirm a second alert
   arrives, while the original due time remains unchanged.
4. Repeat snooze with the app closed and phone locked, and then with an overdue
   task. Complete the snoozed task and confirm no further local alert arrives.
5. Reopen or restart Recall during the five-minute wait; confirm it does not
   cancel or reset the snooze. Edit the due time and confirm the edit takes over.
6. Sign out and verify another account cannot act on the previous account's alert.

Notification permission and the existing precise-alarm permission are still
required for timely delivery. Without precise alarms Android may delay snoozes.
OS battery restrictions or force-stop can also prevent background execution.

Reference: installed flutter_local_notifications 22.3.3 README, Notification
Actions and AndroidManifest setup; https://pub.dev/packages/flutter_local_notifications.
