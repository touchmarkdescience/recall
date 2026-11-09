# Recall — first production release

Prepared 9 November 2026. **Prepared, not submitted or published.**

| Setting | Value |
|---|---|
| App / owner | Recall / Touchmark Descience Pvt Ltd (organization account) |
| Package | com.touchmarkdes.recall |
| Version | 1.0.8 (10) |
| Price | Free; no ads, subscriptions or purchases in this build |
| Production countries | **India, Sri Lanka, Singapore, Malaysia only** |
| Language / time zone | English speech recognition; all app times shown in IST |
| Website / API | https://recall.touchmarkdes.com |
| Support | mohan@touchmarkdes.com |

The owner's later four-country selection replaces the earlier “all supported countries” choice. Play country targeting controls distribution, not access to the public website/API. Singapore and Malaysia are UTC+8; Recall remains on IST by the current product requirement. Do not imply automatic local-time conversion in the listing.

## Files to use

`Recall-Android-1.0.8-build10.aab` is the signed production candidate. Its SHA-256 is `32d6f99003b0c2f1b9144c211090df7705adfaf4ac1af03b2c010349864054c2`.

Use the AAB already in Internal testing if build 10 has been uploaded there; promote/include that existing artifact rather than uploading the same version code again. If it is not uploaded, upload the supplied AAB. Do not rename an older bundle or upload an APK as the Play bundle.

The production ZIP contains the AAB, notes, listing, policy worksheet, readiness evidence, icon, feature graphic and public upload certificate. Build 7 screenshots are included in a clearly marked reference folder. Use recent screenshots from the final Play-installed app for the final listing, or confirm existing Console screenshots still accurately depict it. Keystore, passwords, server secrets, APK and reviewer credentials are excluded.

## Evidence and remaining gates

| Check | Evidence / result |
|---|---|
| Flutter analysis and tests | Build 10: no issues; 51 tests passed |
| Web extraction regressions, typecheck, production build | Passed for the accompanying backend changes |
| Identity, signatures, artifact hashes | Build 10 verification JSON; same upload certificate; version code 10 |
| 16 KB ELF and APK ZIP alignment | Passed for build 10; runtime on a 16 KB device is unverified |
| Public HTTPS URLs | Landing, web app, privacy, terms, support, deletion and `/api/me` returned 200 during this preparation |
| Deletion capability | Current public `/api/me` reports `accountDeletionAvailable:true`; this alone is not a cascade test |
| Live create/save/delete workflow | Historical build 7 disposable-account test passed; no production records changed during this preparation |
| Closed-app/offline alerts | Historical build 7 Android emulator test passed; final build 10 physical-phone confirmation still required |
| Final native speech and date interpretation | Automated callback/parser tests passed; physical build 10 confirmation required |
| Source and backend | Push source to mjsan-dosclub/recall, then owner manually merges to separate touchmarkdescience deployment repo |
| Current Console declarations, pre-launch report, review account | Must be confirmed in the owner's Console; not inspected/submitted in this preparation |
| Anti-abuse controls | No CAPTCHA/email verification/application rate limiter found in the audited signup routes; next phase, not implemented |

Before sending for review, verify on the Play-installed build 10:

1. Sign in, dictate with pauses, stop/review and save; last words appear once. Manual entry still works.
2. “Today at 2:45” while that afternoon time is future shows PM. Explicit AM is not silently changed. Confirm the inferred-time note.
3. Preparation tonight and a meeting tomorrow retain independent dates. An unspecific meeting time requires confirmation.
4. Select Custom time and 15 min before. Save successfully; separate reminders are visible before saving and can each notify.
5. Schedule a reminder a few minutes ahead, close the app normally, turn off Wi-Fi/mobile data and wait. Check lock-screen delivery and sound. Do not use Android Force stop as a normal-close test. Then test reboot/battery restrictions and completion cancellation.
6. Confirm Guest records, full-width long actions and the full Original note after the backend merge.
7. Check account deletion and permissions denied/regranted with a disposable account. Keep reviewer credentials out of source and release files.

Existing misdated/duplicated records have not been rewritten. Correct their times manually where necessary. A source merge does not update an installed Android binary; the Play release does.

## Play Console sequence

1. Select Recall in Touchmark Descience Pvt Ltd's organization account. Keep the existing app/package/signing setup.
2. Confirm Dashboard setup tasks, App content, Data safety, privacy/deletion URLs, content rating, audience, ads declaration, app access and store listing are complete. Give Google a dedicated working review login directly in Console; use fictitious records. Do not assume your tester account is a reviewer account.
3. Open **Test and release → Production → Countries/regions** and select **India, Sri Lanka, Singapore and Malaysia**. Check that “all countries” and automatic addition of new countries are not selected inadvertently.
4. Confirm the app is Free and support/privacy/deletion URLs below are accurate.
5. Open Production → Create new release, or promote the tested build 10 from Internal testing to Production. If that option is disabled, resolve the exact Console task/error shown.
6. Include version code 10 (1.0.8). Review the signing, supported devices and App Bundle Explorer validation; review the pre-launch report. Do not assume alignment tests prove all device compatibility.
7. Paste RELEASE_NOTES.txt. Save and review the release. Resolve actual errors/warnings; do not approve declarations that have not been verified.
8. On Publishing overview, inspect all pending changes, countries and release details before **Send for review**. This document does not submit or approve the release.
9. Follow Google's review outcome. Check the actual publishing mode shown in Console; do not assume an approval is held for a second manual publication step. Do not promise a review completion date.
10. After publication, verify the public listing and installation/update on a normal non-tester Google account in a selected country. Keep the release bundle, signing backup and source commit available.

The special production-access testing requirement described by Google for qualifying new personal accounts must not be assumed to apply to this organization account. Follow any actual Console requirements shown.

## Public links

- Website: https://recall.touchmarkdes.com
- Privacy: https://recall.touchmarkdes.com/privacy
- Account deletion: https://recall.touchmarkdes.com/delete-account
- Support: https://recall.touchmarkdes.com/support
- Terms: https://recall.touchmarkdes.com/terms

## Production release notes

<en-US>
Speak naturally to capture commitments, or add actions manually.
Review meetings, follow-ups and preparation reminders before saving.
Track today’s work, upcoming actions and completed tasks.
Includes improved long notes, Guest grouping and reminder timing.
Free to use. English speech recognition; times shown in IST.
</en-US>

## Next phase — protect public signup and server resources

CAPTCHA is not enabled in build 10 or the accompanying web source. Signup currently validates email syntax, not ownership, then creates a session. Login, extraction/transcription and ask endpoints need abuse controls as well; CAPTCHA by itself is not a complete cost/security control. Prefer completing this hardening before broadly advertising public signup; Google review does not certify the server against abuse.

Proposed next phase (not implemented):

- Cloudflare Turnstile on web signup with mandatory server-side token validation, hostname/action checks, single-use/expiry handling and secret stored only on the server. A frontend checkbox alone is insufficient.
- Durable rate limits for registration and failed logins, plus per-account and aggregate quotas/concurrency limits for costly transcription/extraction/ask calls. Do not depend only on process memory in Vercel serverless instances.
- Request body/audio size limits, bounded execution time and clear retry messages; preserve typed/recorded input after rejection.
- Decide whether email ownership verification is required before granting AI quota. CAPTCHA does not verify an email address.
- Design the native signup path before enforcing web challenges on the shared endpoint. Do not exempt a request because it sends `X-Recall-Client: native`; that header is forgeable. Existing signed-in native sessions should keep working.
- Add provider budget caps/alerts where supported; test missing/forged/replayed/expired tokens, repeated signup/login, quota exhaustion and native compatibility.
- Update privacy disclosures if the chosen CAPTCHA provider introduces additional processing. Obtain the widget's public site key and server secret through local/Vercel environment configuration, not chat.

No new package, CAPTCHA account, email provider, billing setting or production secret was added in this preparation.

## Primary references checked

- Google release preparation: https://support.google.com/googleplay/android-developer/answer/9859348
- Publishing overview/review: https://support.google.com/googleplay/android-developer/answer/9859654
- Current target API requirements (build 10 targets 36): https://developer.android.com/google/play/requirements/target-sdk
- Turnstile server validation: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
