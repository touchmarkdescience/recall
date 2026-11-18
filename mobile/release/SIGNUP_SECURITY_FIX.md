# In-app signup correction

The installed native form could not supply the website's CAPTCHA token. The final correction keeps signup in Recall: enter name/email/password, run Google's native security check, create the account, store the returned session securely, and load Recall. No browser registration handoff remains.

The approved `recaptcha_enterprise_flutter` dependency is pinned to 18.9.3 for compatibility with the current Flutter/Dart SDK. Android package and the approved iPhone bundle ID are `com.touchmarkdes.recall`. iOS 15+ is required by the Google SDK. Website v3 verification is retained independently.

The server verifies a fresh native token with Google, checks signup action, platform key, package/bundle identity and risk score. Client headers or claimed scores do not exempt signup. Missing keys or provider failures reject signup with a retryable message; user inputs remain. Login and existing sessions retain their flow.

Setup and release prerequisites: [NATIVE_SIGNUP_SETUP.md](../../docs/NATIVE_SIGNUP_SETUP.md). No production keys or configuration were changed by this implementation. Tests use mocked Google responses; real signup and device checks remain pending configuration/deployment. The Play build script blocks a store build until the live backend advertises native Android signup readiness.

## Local verification — 10 November 2026

- Flutter analysis: no issues.
- All 61 mobile tests passed, including 10 native signup/protection cases.
- All 15 server security checks passed with mocked Google responses.
- TypeScript typecheck and Next.js production build passed.
- Android debug APK compiled successfully with the Google SDK after aligning Kotlin to 2.4.20 and migrating the JVM-target configuration to compilerOptions. Flutter, Gradle and Android Gradle plugin versions did not change.
- No real Google native assessment or physical-device signup has been verified. Physical iPhone verification and production activation remain pending.

## iPhone preparation — 11 November 2026

`flutter build ios --debug --no-codesign --dart-define=RECALL_API_URL=https://recall.touchmarkdes.com` passed. CocoaPods resolved the Google iOS SDK and the device-target app compiled with bundle ID `com.touchmarkdes.recall`, minimum iOS 15. This is an unsigned compilation check, not installation or real-device validation.

Development signing was attempted with the configured team; Xcode reported no signed-in account and no matching development provisioning profile. Owner must sign in to Xcode and connect/trust the phone before installation. No App Store/TestFlight upload occurred. Native signup remains gated on the mobile-key/backend configuration; existing live accounts can use ordinary sign-in.

## Physical iPhone installation — 11 November 2026

After the owner signed in, selected the Touchmark Descience company team, enabled
Developer Mode, paired the iPhone 15, and reported accepting Apple's updated
agreement, the signed debug build succeeded (37.4 seconds). Flutter's install and
launch step completed in 43.3 seconds. `devicectl device info apps` confirmed
Recall `com.touchmarkdes.recall`, version 1.0.8/build 10; device process inspection
confirmed Runner running. The build uses `https://recall.touchmarkdes.com`.

On-screen onboarding/login, speech, saving, and offline notification delivery
still need user confirmation on the physical phone. No App Store/TestFlight
upload was performed. Native signup configuration remains a separate prerequisite.

## User-confirmed iPhone checks — 11 November 2026

The user confirmed Recall opened and existing-account sign-in succeeded on the
physical iPhone 15. They then reported all steps of the guided test passed:
speaking "Remind me in three minutes to check Recall on my iPhone", retaining
the complete transcript, reviewing and saving the reminder, and receiving the
alert after returning to the Home Screen, disabling Wi-Fi/mobile data, and
locking the phone. These are user-reported results, not automated observations.

This confirms the tested development-build flow only. Native signup, iPhone
notification action buttons, reboot/force-quit behavior, and TestFlight/App Store
distribution were not verified by this test. Android notification action buttons
still need a physical Android test as described in NOTIFICATION_ACTIONS.md.

## Standalone iPhone test build — 11 November 2026

The user encountered Flutter's iOS restriction when reopening the debug build
from its icon. Built the same source with `flutter build ios --release --no-pub
--dart-define=RECALL_API_URL=https://recall.touchmarkdes.com` (63.2 seconds,
21.7 MB). `devicectl device install app` confirmed the signed release-mode app
was installed as an update on the paired iPhone 15. This is a development-signed
release-mode test build, not an App Store/TestFlight distribution. Native signup
and standalone reopen results still need user confirmation.

## Current iPhone replacement — 17 November 2026

The owner later confirmed native signup works in TestFlight; a Mac-installed
development build had been rejected by Google's risk assessment. CAPTCHA checks
were not weakened. The current 1.0.8 (15) replacement includes the same signup
flow and awaits exact-build TestFlight QA and Apple's required physical-device
recording. Earlier setup/build notes above are historical.
