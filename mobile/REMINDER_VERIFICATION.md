# Recall reminder verification — 9 November 2026

## Cause of the reported failure

The supplied screenshot contained pending actions marked untimed (`timeSpecified=false`). The local scheduler intentionally excludes untimed actions. The web parser did not recognize “in another 3 minutes”; it also failed to mark some recognized relative delays as timed. The previous native scheduler silently swallowed native scheduling errors and skipped a future action entirely if its advance reminder time had already passed.

## Changes in 1.0.4

- New mobile actions require a specific future date and time. There is no Any time selection. Speech without a clear time must be corrected in review.
- A deterministic mobile guard recognizes unambiguous short relative delays before review, using the time Review was requested. This works with the existing live API without waiting for a server deployment. The shared web parser source is also corrected and regression-tested; those web changes remain local until merged/deployed.
- Existing untimed pending records are not assigned guessed times. Use **Set reminder time**, select a future time and save. The existing record is updated, with no duplicate interaction/action.
- **Add manually** is available from Today and Actions: type the task, choose follow-up/callback, meeting or reminder, optional person/Guest and notes, then set the date/time and reminder offset. This path does not call extraction or transcription.
- If an advance reminder is already past but the action is still future, the native alert falls back to the due time. This fallback is shown in review/settings.
- Permission state, precise-alarm access, pending count, next alert, untimed records and scheduling failures are visible in Settings. Settings includes a one-minute local test. Android has a shortcut to the phone's notification settings.
- Native alarms reconcile against the OS pending queue on refresh/restart, permission changes and completion. Logout clears all device alarms. Scheduling operations are serialized.
- iOS foreground-notification delegate configuration was added. iPhone delivery has not yet been verified.

## Actual native Android test

Device: existing Pixel 3a XL Android 13 emulator (API 33). Entry point: `tool/reminder_probe.dart`, which calls the production `LocalReminders` scheduler with three synthetic account-isolated actions. It makes no API calls or production data writes. Notifications and precise-alarm access were granted on this emulator before testing.

| Action | Wi-Fi on, app backgrounded — posted IST | Airplane mode, Wi-Fi/data off, app process terminated — posted IST |
| --- | --- | --- |
| Reminder | 09:56:13.005 | 09:58:43.601 |
| Meeting | 09:56:12.990 | 09:58:43.643 |
| Follow-up | 09:56:12.772 | 09:58:43.634 |

Online scheduled time: 09:56:12.132 IST. Offline scheduled time: 09:58:41.310 IST. All six native notifications were posted within three seconds of their scheduled time, as reported by Android `dumpsys notification --noredact` (`android.text`, `mCreationTimeMs`). Extracted synthetic-only evidence is in `build/reminder-verification/posted-notifications.json`.

Before the offline alarms fired, `am kill --user 0 com.example.recall_mobile` terminated the app and a subsequent `pidof` returned no process at 09:58:24 IST. Connectivity checks returned airplane mode `1`, `Wifi is disabled`, and mobile data `0`; these states were still set when delivery was inspected. The emulator's connectivity was restored after testing. This was normal background/process termination, not Android Settings Force stop.

## Automated checks

Flutter checks cover the exact reported relative phrases, ambiguity protection, manual creation with required time, repair of existing records without duplication, all three reminder types, missed-lead fallback, visible scheduler errors, persisted stale-alarm cancellation, completion/refresh/restart behavior, editing/review and short-screen layouts. Web extraction regression tests include the same reported phrases and explicit timing metadata. The APK is built from `lib/main.dart`; the isolated probe is not the deliverable entry point.

## Release gate still requiring the physical devices

1. Install the new test APK over the old app. In Settings, verify notifications and precise timing are allowed. Run **Test reminder in 1 minute**, leave Recall, turn off Wi-Fi/mobile data and confirm the alert.
2. Create one actual follow-up, meeting and reminder, using both voice and Add manually. Verify the shown time, close the app and confirm delivery. Repair any older untimed pending records using Set reminder time.
3. Verify sound/lock-screen presentation and the phone's battery restrictions on the user's actual Android device. Emulator delivery does not prove a manufacturer's physical-device behavior.
4. Verify the iPhone build, permissions, foreground/background/offline delivery, and reboot behavior. These were not tested in this run.
5. Before store upload, replace the generated application/bundle IDs with team-owned identifiers and configure production Android/Apple signing. The supplied APK is a debug-signed test build, not a store release. No store upload or production deployment was performed.
