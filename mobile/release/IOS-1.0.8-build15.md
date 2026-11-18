# Recall iPhone 1.0.8 (15) — replacement review candidate

Prepared 17 November 2026. Bundle ID `com.touchmarkdes.recall`.
The owner confirmed 1.0.8 (12) is still rejected under Guideline 2.1 and the
physical-device recording remains outstanding. Keep marketing version 1.0.8;
build 15 replaces the selected rejected binary. Do not create a separate iOS version
solely because the shared pubspec now defaults to Android 1.0.10+16.

## Included

- Parallel account/dashboard loading and confirmed completion without a blocking
  full-dashboard reload. Pending completion hides the active card immediately;
  success/failure feedback is a nonmodal snackbar, with failure restoring it.
- Existing native reminder scheduling/reconciliation, offline notification
  completion and five-minute snooze. Reminder times are not changed by snooze.
- Native Google reCAPTCHA signup and ordinary existing-account sign-in.
- iPhone-only device family 1, minimum iOS 15, permanent Touchmark bundle/team.
- Opaque App Store icons and genuine matching objective_c debug symbols.
- Production API `https://recall.touchmarkdes.com`; the new shared backend has
  already been deployed and tested through the PWA by the owner/agent.

Native new saves still await the existing refresh/reminder scheduling path.
The PWA's committed-snapshot frontend merge is not a Flutter change in this build.
Do not quote the local web 116/114 ms benchmark as physical-iPhone save timing.

## Build

From `mobile`:

```sh
bash tool/build_ios_release.sh --build-name=1.0.8 --build-number=15
```

This overrides the shared pubspec version for this iPhone binary. The script does
not upload or submit to review. Archive/IPA validation and actual upload status
are recorded separately in `ios-1.0.8-build15-verification.json` once available.
The previous build 14 archive was retained under build/deliverables before building.

## TestFlight first, then recording and resubmission

1. Upload the verified build 15 through Xcode Organizer. Confirm App Store Connect
   processing completes and the version/build shown are 1.0.8 (15).
2. Make that exact build available to the existing TestFlight tester group and
   install/update it on the physical iPhone. Do not use the Mac development build
   for native CAPTCHA acceptance; the owner previously verified TestFlight signup.
3. Check the phone's Software Update screen for the latest available stable OS.
   Note the actual device model and installed OS version; do not assume either.
4. Test signup/login, standalone reopen, speech, manual entry, Save/edit, immediate
   completion with free navigation, failure/retry, People, Settings, account
   deletion, closed-app reminders, notification completion and five-minute snooze.
   Use disposable test data; preserve the reviewer login/account.
5. Record the physical phone starting on its Home Screen and launching Recall.
   Show signup, logout/login, typical voice/manual entry → review → save →
   Actions/People, a real alert and disposable-account deletion. Keep passwords
   masked. Use the detailed recording checklist in `APP_STORE.md`; no simulator
   footage or fabricated/speeded-up events.
6. Review the recording for legibility/audio and make it reviewer-accessible.
   Add the link/attachment plus the six requested information sections to App
   Review Information → Notes. Replace all placeholders with verified facts.
7. In the existing rejected 1.0.8 version select build 15, check screenshots,
   privacy, reviewer credentials and availability, then resubmit only once the
   requested evidence and exact-build physical-device QA are complete.

The owner must supply the real recording and exact-build device results; automated
tests and successful upload cannot satisfy Apple's recording request.

## Suggested TestFlight “What to Test”

```text
Please test creating an account and signing in, speaking or manually adding a
follow-up, saving/editing it, and marking it complete while navigating between
screens. Verify due/reminder times persist after reopening. Enable phone reminders
and test an alert while the app is closed, then Mark completed and Remind in
5 minutes. Test account deletion only with a disposable account.
```

## Automated verification

17 November: Flutter analysis reported no issues and all 72 Flutter tests passed,
including immediate completion/rollback, no redundant completion dashboard read,
parallel startup, signup protection, notification action isolation, scheduling,
offline snooze and completion reconciliation. Platform calls are mocked; these
are not physical-device delivery results for build 15.
