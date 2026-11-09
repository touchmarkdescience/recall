# Recall — Google Play release preparation

Prepared 9 November 2026. Owner: **Touchmark Descience Pvt Ltd** (organization account).
Name: **Recall**. Package: **com.touchmarkdes.recall**. Candidate: **1.0.8 (10)**.
Price: **Free**, no in-app purchases, no subscriptions, no advertising SDK in the current app.
Audience: friends and professional users, with a possible public free release. No admin dashboard in this scope.

The current production handoff is [PRODUCTION_RELEASE.md](PRODUCTION_RELEASE.md), including the selected four countries and build 10 gates. Older build 7 verification below remains historical.

## Current state

Build 10 is prepared and verified locally. Earlier versions were released to Internal testing by the owner. Production submission/publication is not performed by this preparation. The custom-domain production API is https://recall.touchmarkdes.com.

The account-deletion backend and public pages are deployed and respond successfully on the custom domain. The build helper blocks a normal release if `/api/me` lacks `accountDeletionAvailable:true`; `--candidate` explicitly allows a staged build for testing. This flag is a code capability check, not proof that production schema cascades were verified.

## Private upload key — back this up

Created for this new app with owner approval:

- `mobile/android/recall-upload.keystore` — **private**, permission 600, ignored by Git.
- `mobile/android/key.properties` — **private passwords and configuration**, permission 600, ignored by Git.
- Alias: `recall-upload`; RSA 2048, PKCS12; certificate expires 27 March 2054.
- `mobile/release/upload-certificate.pem` — public certificate only; safe to give Play Console if requested.

Back up the keystore **and** passwords securely in your company password manager/encrypted storage. Do not email them, paste passwords into chat, put them into a repo, or include them in the release assets ZIP. When restoring on another machine, update `storeFile` in ignored key.properties. The provided `key.properties.example` contains placeholders only.

For a new app, select **Play App Signing** when prompted. Let Google manage the app signing key. This local upload key signs the bundle you submit; Google signs distributed installs with its separate app signing key. Keep the upload key for subsequent releases. See [Flutter Android release](https://docs.flutter.dev/deployment/android) and [Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842756).

The old debug APK uses a different package ID. The release installs separately; sign in with the existing live account to sync records. Allow notification/alarm permissions again for the new app. Remove the old test app after checking migration to avoid duplicate reminders. A locally installed upload-key APK may need uninstalling before installing the Google Play-signed version of the same package. Do not lose unsubmitted notes.

## Domain and page deployment

1. In the **existing Recall Vercel project**, add `recall.touchmarkdes.com` under Settings → Domains. Keep the existing GitHub integration unchanged; the owner manually merges the source repo into the deployment repo.
2. Add the DNS record Vercel shows in the touchmarkdes.com DNS provider. Use Vercel's displayed host/target; do not invent a CNAME value. No Supabase project migration is required.
3. Merge/deploy these source changes, preserving production secrets. No new server secret is required for these pages/deletion. HTTPS must be valid.
4. Verify these public links (no login required):
   - `/` — landing, free-to-use copy, mobile release status, web entry.
   - `/app` — existing web app/signup; `/app?mode=login` — sign-in.
   - `/privacy` — Recall-specific privacy policy.
   - `/delete-account` — deletion without an installed app; login/password verification and support fallback.
   - `/support` — support and notification troubleshooting.
   - `/terms` — free use, responsibilities and notification limits.
5. Verify `https://recall.touchmarkdes.com/api/me` returns JSON including `accountDeletionAvailable:true`. Test with a **disposable production account**, never an existing customer account: signup → save data → wrong-password rejection → deletion → login revoked. Cloud schema deletion cascades are specified in `supabase/schema.sql` but require live verification.
6. Existing custom authentication is cookie/Bearer based, not Supabase Auth. Users must sign in on the new origin; their existing account credentials remain valid. Browser push subscriptions are origin-specific and need enabling again there. Keep the current Vercel hostname working for installed clients and the existing five-minute cron caller.
7. Review/approve the privacy and terms copy, including provider backups/log retention and the company's actual support process. The supplied corporate privacy page is broad; Recall-specific processing is documented separately. Adjust retention statements if the company's actual policy differs.

## Build

From `mobile` with Flutter/Android tools installed and key.properties restored:

```sh
RECALL_API_URL=https://recall.touchmarkdes.com ./tool/build_play_release.sh
```

Candidate against the current working host while waiting on deployment:

```sh
./tool/build_play_release.sh --candidate
```

Output: `build/app/outputs/bundle/release/app-release.aab`. Upload an **AAB**, not the earlier debug APK. The helper fixes `lib/main.dart` as entrypoint; never submit `tool/reminder_probe.dart` or preview tools. Increase the pubspec build number for every subsequent Play upload. Release builds have no debug-signing fallback, block cleartext traffic and require an explicitly configured HTTPS API. Android backups are disabled to avoid restoring private sessions/credentials. Application ID is committed; optional ignored `release.properties` can override it only if intentionally required.

Current build uses target SDK 36, minimum SDK 24, AGP 8.11.1 and Flutter 3.41.1. [Current target API requirements](https://developer.android.com/google/play/requirements/target-sdk) require API 36 for new phone apps as of August 2026.

## Play Console steps — internal test first, then free public release

1. In Touchmark Descience Pvt Ltd's Play Console, **Create app** → Recall → English → App → **Free**. Do not select managed/private distribution for the friends/public plan. Do not change the existing web hosting GitHub connection.
2. Finish developer identity/account checks shown in Console. Package availability is not confirmed until Play accepts the first bundle; package name cannot subsequently be changed for that listing.
3. Testing → Internal testing → create release → enable Play App Signing → upload the AAB. Add friends' Google-account emails (up to 100 testers), save the tester list and share the opt-in link after rollout. Google may take time to make a first test link available. [Internal testing instructions](https://support.google.com/googleplay/android-developer/answer/9845334).
4. Test the Play-installed app, permissions, voice/manual save, completion and actual offline reminder delivery on physical phones. Inspect Play's pre-launch report and App Bundle Explorer before expanding distribution.
5. For closed/public release, finish store listing, app access, Data safety, privacy/deletion links, content rating, target audience, ads declaration and any other Console declarations. Use `STORE_LISTING.md` and `DATA_SAFETY.md` as drafts; the owner must attest to actual service practices. Do not fabricate questionnaire answers or reviewer credentials.
6. Invite-only testing is not an access-control system: the existing API allows account registration. Do not advertise a private employee-only system. A future admin/invite system is a separate project.
7. The 12-testers/14-days production-access requirement is for qualifying **new personal accounts**, not a general organization-account requirement. Follow any requirements Console actually shows. Do not assume review approval or guaranteed release time.

## Required before public submission

- Deploy and exercise account deletion on Supabase, including actual foreign-key cascades. It deletes active records, not external Google Sheets exports/provider backups. The mobile flow clears its session and scheduled reminders. Other offline phones may retain already scheduled alerts until they reconnect/sign out; document this limitation.
- Finalize custom domain and live URLs; rerun the normal build helper against the final host.
- Owner reviews privacy/terms, backup/log retention and Data safety declarations.
- Dedicated reviewer/demo account and instructions if login is required. Use only fictitious records and no private user credentials. Provision after deployment.
- Capture at least two clean screenshots from the actual final app. The widget preview renderer outputs design/test previews, not physical-device evidence. `assets/icon-512.png` and `assets/feature-graphic.png` are prepared; validate final assets in Console. [Play preview asset requirements](https://support.google.com/googleplay/android-developer/answer/9866151).
- 16 KB: check ELF alignment, bundle page alignment/generated APK alignment and test on a 16 KB device/emulator. A successful 4 KB emulator run alone does not prove runtime compatibility. [Android page-size guidance](https://developer.android.com/guide/practices/page-sizes).
- Physical Android: speech recognizer (English), permissions denied/regranted, one-minute limit, manual entry, date/time review, offline delivery after scheduling, notification sound, reboot, battery restrictions, completion cancellation, refresh/restart and account deletion.
- iPhone delivery/store signing is a separate release; not verified or claimed by this Android submission.

## Scope and cost

Recall is free to users. Hosting, developer account and external API services may still have costs/rate limits to the operator; no unlimited transcription promise is made. Native Android uses phone speech recognition; web Groq/Gemini settings do not replace the native recognizer. No admin activity dashboard or analytics SDK has been added. No production data deletion, store upload or Git push is performed by this preparation task.

## Build 7 actual verification update

The signed main-app APK was installed on the Pixel 3a XL Android 13 emulator. It authenticated with a disposable account, loaded records through the custom-domain API, and scheduled all three reminder kinds. In airplane mode with Wi-Fi and mobile data off and no running Recall process before delivery, Android posted reminder, meeting and follow-up notifications at 11:25:08 IST for a due time of 11:25:07.726 IST (all within one second). See `offline-release-verification.json`. This is release APK evidence, separate from the earlier debug/probe test. It does not establish real-phone sound, reboot, battery-management behaviour or 16 KB runtime compatibility.

`BundleConfig.pb` decoded with the existing cached bundletool/protobuf libraries specifies `PAGE_ALIGNMENT_16K`; the final APK passes `zipalign -c -P 16 -v 4`. All six inspected arm64/x86_64 ELF libraries have load segment alignment of at least 16 KB. No new app dependency or heavyweight PWA/native framework was installed.
