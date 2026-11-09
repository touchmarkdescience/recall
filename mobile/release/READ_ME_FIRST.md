# Recall — first Google Play upload

Owner: Touchmark Descience Pvt Ltd (organization account)
App: Recall — free, no subscriptions or in-app purchases
Package: com.touchmarkdes.recall
Version: 1.0.5, build 7
Live API and website: https://recall.touchmarkdes.com

## Upload to internal testing first

1. Open your organization's Play Console and create **Recall** as an **App**, English, **Free**. Keep it eligible for public/friends distribution; do not restrict it as a managed organization-only app.
2. Open Testing → Internal testing → Create release. Use Play App Signing with a Google-managed app signing key when prompted.
3. Upload `Recall-Android-1.0.5-build7.aab` from the release package. Do not upload the old debug APK, old candidate AAB, or a reminder-probe build.
4. Paste the release notes from `STORE_LISTING.md`. Add friends' Google-account emails to the tester list, save and share the opt-in link after rollout. A newly created app/test link may take time to become available.
5. Install through that link and test voice recognition, manual entry, saving, completion, refresh, and notification delivery with the app closed and Wi-Fi/mobile data off. Check the phone's notification/exact alarm permissions and battery restrictions.
6. Review Play's bundle validation and pre-launch report. Fix any reported issue before widening distribution.

Nothing has been uploaded or published by the preparation task. The package's availability and Play acceptance are confirmed only by the actual upload.

## Website URLs for Console

- Website: https://recall.touchmarkdes.com
- Privacy: https://recall.touchmarkdes.com/privacy
- Account deletion: https://recall.touchmarkdes.com/delete-account
- Support: https://recall.touchmarkdes.com/support
- Support email: mohan@touchmarkdes.com

## Included

- Signed AAB for Play upload; package is com.touchmarkdes.recall, version 1.0.5 (7), target SDK 36.
- Store icon, feature graphic, and phone screenshots with synthetic/example records.
- Listing text, release notes, privacy/Data safety worksheet and detailed setup guide.
- Public upload certificate and build/API/reminder verification reports.

The signed APK is supplied separately for direct device testing. A locally sideloaded upload-key APK and the Play-signed app may have different signing certificates: uninstall the sideloaded app before installing from Play if Android reports a signature conflict. Save/sync notes first.

## Verification completed

- Flutter analysis clean; all 23 automated tests passed.
- Signed AAB/APK built; upload certificate and bundle/APK signatures verified.
- Custom-domain API, privacy/support/deletion pages verified over HTTPS.
- Live disposable signup, native session, three action types saved/read, wrong-password/confirmation rejection, account deletion and session revocation passed. Test account and temporary credentials removed.
- Release APK posted all three notification kinds while offline and app process terminated, within one second of due time on Android 13 emulator. See offline-release-verification.json.
- 16 KB bundle packaging, APK ZIP alignment and 64-bit ELF alignment passed. Runtime on a 16 KB device remains unverified.
- Store screenshots captured at 1080×2160 using synthetic records.

## Remaining before a public production release

- Test the Play-installed build on physical Android phones, especially offline reminders, sound, lock screen, reboot/battery restrictions and native speech availability.
- The native libraries and APK/bundle packaging pass 16 KB alignment checks. Runtime on an actual 16 KB device/emulator remains unverified.
- Approve privacy/terms and actual hosting backup/log retention. Complete Console's Data safety, content rating, target audience, app access and other declarations truthfully. Drafts are guidance, not submitted attestations.
- Provide a dedicated review account in Console if required. Do not use your own/customer account credentials or commit them in the repo.
- Verify account deletion on all intended devices; external Sheet exports/provider backups and already scheduled alerts on other offline phones are not remotely erased.

## Key backup

The upload keystore and passwords are deliberately NOT in this ZIP or Git. Back up `mobile/android/recall-upload.keystore` and ignored `mobile/android/key.properties` in secure company storage before distributing the app. Do not send them in chat or email. See PLAY_STORE.md for restoration and signing details.

The Flutter source remains local in `mobile/`; this release package is not a source backup. The previous website commit was pushed separately. No admin activity dashboard was added.
