# Recall Android 1.0.10 — version code 16

Prepared 17 November 2026. Owner confirmed the latest Play release is
1.0.9 (13). This replaces the older build 13 candidate in the local handoff.

## Play release notes

<en-US>
Smoother loading and follow-up updates.
Mark actions complete immediately while Recall syncs in the background.
Create an account securely inside the app.
Complete tasks or snooze for five minutes directly from reminder notifications.
</en-US>

## Included changes and compatibility

- Parallel account/dashboard requests; successful completion no longer blocks
  on another full dashboard fetch. Pending completion hides the active action
  while users continue navigating, with quiet success/failure feedback.
- Native Google reCAPTCHA signup and existing-account login. Login does not
  require a new CAPTCHA; signup protection is not bypassed.
- Notification actions: Mark completed and Remind in 5 minutes. Account-owned
  pending notification completions and snoozes remain on the device; snooze
  retains the original due time. Existing reminder scheduling is retained.
- Android's non-exported notification action receiver is declared; the Kotlin
  configuration matches the already-approved native signup dependency.
- Package `com.touchmarkdes.recall`, existing upload certificate and production
  API `https://recall.touchmarkdes.com` are preserved.
- Native Save still performs the existing dashboard/reminder reconciliation.
  The PWA committed-snapshot UI is not a Flutter change. Do not quote the local
  116/114 ms backend benchmark as an Android phone timing measurement.

## Build and evidence

From `mobile`:

```sh
bash tool/build_play_release.sh --build-name=1.0.10 --build-number=16
python3 tool/verify_android_bundle.py --version=1.0.10 --code=16
```

The build helper verifies that the live backend advertises account deletion and
configured native Android signup. It does not bypass those checks with candidate
mode. Verification reads version/package/SDK and page-alignment metadata from
the actual AAB, checks signature and upload certificate, inspects 64-bit ELF load
segments, checks the action receiver and scans for known local server secrets.
It copies the final signed bundle to:

`mobile/build/deliverables/Recall-Android-1.0.10-build16.aab`

Evidence: `android-1.0.10-build16-verification.json` after successful verification.
The verifier uses existing Gradle-cached bundletool/aapt2 protobuf descriptors;
it does not install a new app dependency. ELF/config checks do not establish
runtime behavior on a 16 KB device or Play-delivered APK ZIP alignment.

## Rollout

1. Play Console → Recall → Test and release → Testing → Internal testing.
   Create a release and upload only the build 16 AAB. Confirm version/package
   and certificate acceptance; do not upload the old build 13 file. Add the
   release notes above and use the existing tester group.
2. Install/update through the Play internal-test link on a physical Android phone.
   Native CAPTCHA acceptance must be tested with a Play-distributed build.
3. Test signup and existing login; cold/standalone reopen; voice/manual entry;
   save/edit timing; immediate completion with navigation and confirmed state
   after reload. Use labelled disposable actions; keep reviewer credentials active.
4. Enable notifications and exact alarms where supported. Schedule a near-future
   real reminder, close the app, lock the phone and verify delivery. Test Mark
   completed and Remind in 5 minutes from the expanded notification. Test both
   while offline, then reopen online and check reconciliation. Repeat for
   follow-up, reminder and meeting; verify original due time survives snooze.
5. Verify completion cancels future alerts and sign-out cancels account reminders.
   Check denied permissions and battery restrictions. Physical delivery, sound,
   reboot and 16 KB runtime behavior remain device acceptance checks.
6. Review Data safety against the actual Google SDK disclosures; see
   DATA_SAFETY.md. Retain existing privacy/deletion URLs, working reviewer access
   and production countries: India, Sri Lanka, Singapore and Malaysia.
7. After acceptance, promote the tested bundle to Production and review Console
   changes before submitting. Creating a local AAB is not a Play upload/release.

The common Flutter source passed analysis and all 72 tests during today's iPhone
preparation. Android build verification is recorded separately. No Play upload,
physical Android acceptance or production rollout is claimed by these notes.

Apple build 1.0.8 (15) is independently processing; Android work does not change
its build number or App Review recording requirement.
