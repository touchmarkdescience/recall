# Recall iPhone distribution

Bundle ID: `com.touchmarkdes.recall`. Signing team: Touchmark Descience.
The device-signed release build used for testing is not an App Store upload.

## Current replacement — 1.0.8 (15)

The owner confirmed 1.0.8 (12) remains rejected and the physical-device recording
has not yet been submitted. Build 15 is the current replacement candidate; see
[build 15 rollout](IOS-1.0.8-build15.md) for its scope, verification and exact-build
TestFlight/recording checklist. The build 12/14 entries below are historical.
Keep version 1.0.8 in App Store Connect and select the replacement build after
processing; do not resubmit before the requested recording is complete.

## iPhone-only change — 17 November 2026

The owner requested iPhone-only native support. Debug, Release and Profile now
target device family 1, and the iPad-specific orientation entry was removed.
The simulator build 1.0.8 (14) succeeded; its compiled Info.plist contains
`UIDeviceFamily: [1]`. This is not an uploaded or signed distribution archive.
Build 12 already uploaded to Apple still includes iPad; its metadata cannot
change that binary. Build/upload a new archive with an unused build number,
select it in App Store Connect, then test and record that exact TestFlight build
on the physical iPhone. Update the build references in the draft review notes
below before resubmitting. The simulator is not physical-device evidence.
iPhone-only apps may still be offered in iPad compatibility mode; do not add
unneeded device capabilities merely to prevent this or promise Apple will never
review on an iPad. iPad-native screenshot requirements must be rechecked after
App Store Connect processes and selects the replacement build.

## Build and validate

17 November verification: the iPhone-only signed archive 1.0.8 (14) was built,
and `codesign --verify --deep --strict` passed with macOS trust-service access.
Icons are opaque and the native objective_c dSYM matches its binary. Automatic
App Store IPA export failed with `No Accounts` / missing iOS Distribution
certificate. Restore the signing account/certificate in Xcode and distribute the
existing archive; do not mistake Flutter's successful archive for a successful
IPA export or upload. See `ios-1.0.8-build14-verification.json`.

From `mobile`, use an unused iOS build number:

```sh
bash tool/build_ios_release.sh --build-name=1.0.8 --build-number=15
open build/ios/archive/Runner.xcarchive
```

The wrapper preserves the existing Recall icon artwork, encodes the catalog PNGs
without an alpha channel, builds the archive/IPA, then prepares matching native
asset symbols in the archive. It does not upload or submit anything.

In Xcode Organizer, select the freshly built archive (verify its build number),
validate it, then use Distribute App → App Store Connect → Upload. Do not reuse
the older archive whose icon validation failed.

## Resolved local archive checks

The rejected 1024px icon had transparent corners. The catalog is now flattened
against its existing green background, without changing the logo or dimensions.
`tool/prepare_ios_icons.swift` encodes opaque RGB PNGs; `sips` verifies no alpha.

The installed objective_c 9.5.0 native-asset hook already compiles line-table
debug information, but its dSYM was absent from the archive. The referenced
compiled objects were available, so Apple's `dsymutil` could produce a genuine
dSYM. `tool/prepare_ios_archive.py` verifies matching UUID/architecture pairs and
nonempty DWARF compilation units. It fails instead of fabricating symbols and
rejects an archive older than its source icons. No dependency or Flutter SDK
upgrade was used for these corrections.

Run the wrapper again after a clean build; native-object paths can change.
If symbol generation fails after removing build caches, rebuild before retrying.
Local checks do not prove Apple's upload/review acceptance.

Build 1.0.8 (12) completed on 11 November 2026: archive 36.9s, App Store IPA
export 46.5s. The compiled Assets.car contains an opaque 1024px icon and all 20
icon renditions report Opaque=true. The objective_c dSYM matches UUID
965BC160-DA10-32A2-9703-4A93A3CA63C1 (arm64), with eight real compilation units.
Xcode/App Store server validation remains to be repeated by the owner. Flutter
also reports the existing 1px launch-image placeholder warning; this correction
does not change the launch screen.

## Remaining submission work

Complete the App Store listing, actual iOS screenshots at Apple's requested
sizes, pricing/availability, App Privacy (including native reCAPTCHA), age rating,
reviewer login/contact details, and export-compliance questions. Confirm the
account-deletion flow remains accessible in Settings. Public release requires
Apple review and the selected release action.

## Guideline 2.1 response — 12 November 2026

Apple rejected version 1.0.8 (12) requesting a physical-device demonstration and
six items of review information. The supplied message does not identify a
specific crash. Do not resubmit until the requested recording and physical-device
QA are complete. This section is a draft; it has not been sent to Apple.

### App Review Notes — copy after completing the evidence fields

Replace every bracketed field with verified information. Keep the working demo
credentials in App Review Information's dedicated sign-in fields. Never put
passwords in this repository or the video.

```text
1. Physical-device demonstration
Recording: [ATTACHMENT NAME OR REVIEWER-ACCESSIBLE VIDEO URL]
Device: [PHYSICAL DEVICE MODEL]. OS: [INSTALLED VERSION; CONFIRM LATEST AVAILABLE].
App: Recall [VERSION AND BUILD ACTUALLY RECORDED], installed through [ACTUAL INSTALLATION METHOD].
The recording shows launch, signup, sign-out/login, voice/manual entry, review,
save, Actions, reminders, People history, and disposable-account deletion.

2. Purpose and audience
Recall is a free personal productivity app for the general public, especially
salespeople, founders, business leaders, and anyone managing work commitments.
It helps users capture what they promised after a call or meeting and remember
the next action. It is not restricted to Touchmark employees, invited companies,
or an organization's customers. No employer setup or invitation is required.

3. Access and main features
Use the demo credentials in the Sign-in Information fields. There is one account
type. No OTP, payment, subscription, sample file, or invitation is required.
Internet is required for account access and sync.
New users can also register inside the app using name, email, and password.
Tap Speak in the bottom navigation, allow microphone and speech recognition,
and dictate a note. Stop, tap Review details, check/correct the person, action,
date and reminder, then save. The person is optional. Add manually is available
on Today/Actions. Actions shows tasks and their completion status; People groups
contact history. Enable Phone reminders in Settings and allow notifications.
Test an alert by saving a reminder a few minutes ahead, then going Home/locking
the phone. Local reminders can work offline, subject to permissions/device
settings. Touch and hold an alert for completion/five-minute snooze. To delete
an account: Settings → Delete account → enter password → confirm → Delete
permanently. Use a disposable account; keep the reviewer account active.

4. External services and tools
The app is built with Flutter. Its iOS speech feature uses Apple's Speech
framework through speech_to_text; speech processing depends on Apple's service
and device availability. The native app sends resulting text, not an audio
recording, to Recall. The production API is hosted on Vercel at
https://recall.touchmarkdes.com. Account authentication is implemented by Recall;
Supabase stores account and application records. Google reCAPTCHA Enterprise
verifies native signup requests for abuse prevention. Current server text
extraction is rule based; an external LLM is not currently enabled. Reminders
use iOS local notifications; session data uses secure device storage. Optional
Google Sheets/Apps Script export is account-configured through the companion
web app and is not required to use the native app. There is no payment processor.

5. Regional behavior
Recall offers the same core features wherever it is distributed. There are no
region-specific paid tiers or content catalogs. All action/reminder dates are
interpreted and shown in Indian Standard Time (Asia/Kolkata), including outside
India; time zones are not automatically localized. The current speech flow
uses English. Speech-service availability, permissions, and connectivity may
affect recognition; manual entry remains available.

6. Regulated services, content, and payments
Recall is a general productivity tool. It does not provide regulated medical,
financial, legal, or gambling services or distribute licensed media catalogs.
Users' notes and entered contacts are private to their own account. There is no
public posting, social feed, user discovery of other users' notes, or user-to-user
messaging. Public-content reporting/blocking flows are therefore not applicable
to this version. The app has no paid content, purchases, subscriptions, or ads.
```

### Physical-device recording checklist

- Use the replacement iPhone-only **1.0.8 (15)** build once uploaded and available
  in TestFlight. Verify its build number; build 12 still includes native iPad
  support and Android 1.0.9 (13) is not this iOS submission.
  If this build is unavailable, resolve installation before recording; do not
  substitute simulator footage or footage of a materially different build.
- On the physical iPhone, check Settings → General → Software Update and install
  the latest available stable OS before testing/recording. Record the actual
  model and OS version. Do not claim latest OS without checking.
- Enable Focus/Do Not Disturb or otherwise prevent unrelated personal messages
  appearing during the demo. Use fictional sample contacts and non-confidential
  tasks. Enable normal notification delivery again for the reminder segment.
- Start iOS Screen Recording while on the Home Screen, then launch Recall. The
  footage must show launching, not begin halfway through the app. Use a clear
  continuous demonstration; no promotional edits, speedups, or simulated events.
- Create a disposable account whose inbox you control. Keep password entry
  masked; do not reveal personal passwords or authentication codes. Show
  successful registration, sign out, then sign back in. Keep the separate
  reviewer demo account active throughout review.
- Tap Speak, grant the relevant microphone/Speech permissions, and speak:
  “I just spoke with Arjun. We'll discuss the PPT tomorrow at 6 PM. Remind me one
  hour before.” Stop, review the extracted values, correct any mistake, and save.
  Show the saved action in Actions and the interaction in People. If iOS screen
  recording interferes with microphone capture, resolve it or use a clear
  physical-camera recording; do not pretend a typed example is voice recognition.
- Show Add manually; create a second short reminder a few minutes ahead, confirm
  the correct date/time/IST, and save. Go to Home/lock the phone, show the alert,
  and show its available notification actions. If demonstrating five-minute
  snooze, allow the real five minutes; don't substitute an edited timer.
- Return to Recall and show the saved/completed state. Finally, in Settings,
  delete only the disposable account using its password and confirmation.
  Show the return to authentication and verify the deleted login no longer works.
- Check the saved recording includes speech, legible UI, and the complete flows.
  Do not assume iOS Screen Recording captures spoken microphone audio; review
  the file. A separate clearly labeled physical-device clip is preferable to
  omitting a required flow if recording is interrupted by permissions/audio.
- Record a private/reviewer-accessible URL or attach the recording through App
  Review messaging; test access without relying on the owner's login. Put the
  attachment name/URL in Notes as Apple requested. Don't publish account details
  or confidential task records to an unrestricted video link.

### QA and resubmission gate

- Prior user-reported iPhone tests passed, including signup and notification
  buttons. They do not establish that the exact submitted build was tested on
  the latest OS. Complete that check and the requested recording now.
- The rejected build 12 declares iPhone and iPad support. The owner has now
  requested iPhone-only support; select the replacement device-family-1 build
  before resubmitting. Earlier iPad simulator screenshots are historical evidence,
  not physical testing. Recheck Console requirements after selecting the new
  binary; iPhone compatibility mode on iPad remains an Apple platform behavior.
- On 12 November the public production capability endpoint reported
  `aiMode: Local rules` and `accountDeletionAvailable: true`. This is a capability
  check, not a new successful end-to-end signup/deletion test.
- Check the reviewer credentials directly on the submitted build and keep its
  account/data available. Do not bypass or disable signup security for review.
- Verify availability, privacy disclosures, support/privacy URLs and screenshots
  still match the submitted app. A video alone does not replace working features.
- Update App Review Information → Notes with all six completed responses, Save,
  and reply to Apple's message pointing to the recording and updated Notes.
  Resubmit the app version when all requested information and QA are ready.
  A new binary is not required solely to add review information; if testing
  reveals a bug or functionality changes, fix, test and upload a new build.

References:
- https://developer.apple.com/app-store/review/guidelines/#app-completeness
- https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/reply-to-app-review-messages/
