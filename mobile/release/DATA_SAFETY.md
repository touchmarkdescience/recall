# Data safety / policy worksheet — owner review required

This is an evidence-based draft, not a completed Play Console declaration. Services, provider contracts and retention practices require the owner's verification. Internal-test-only apps currently have a Data safety exemption; complete the form before relevant wider release. See [Google's instructions](https://support.google.com/googleplay/android-developer/answer/10787469) and [deletion policy](https://support.google.com/googleplay/android-developer/answer/13327111).

| Data/practice | Current implementation | Submission consideration |
|---|---|---|
| Name, email, account identifier | Signup/login, server database, device session | Personal info / user IDs, account management and app functionality. Required account email; name supplied at signup. |
| Password | Sent over HTTPS; server salted scrypt hash; not stored as plaintext | Authentication data; never declare credentials public or shared for advertising. |
| Task/conversation text, manually entered people/phone numbers | Supabase records via account-owned API; optional server extraction | User-generated content and any personal data contained within it. Contact-book permission is NOT used; that does not mean user-entered contact information is never collected. |
| Audio in native Android | Phone speech recognition; native app sends text, not audio files, to Recall | The speech service may process audio remotely. Verify the recognizer/provider disclosures; do not claim all audio stays on-device. |
| Web audio | Separate browser workflow may upload recordings to Gemini/Groq | Privacy page covers web and native; scope the Play declaration to the distributed app while considering linked/shared services. |
| Secure session and pending completion state | flutter_secure_storage on device; sessions in server | Device/session identifiers used to authenticate; no ads identifier requested by app code. |
| Reminder queue | OS scheduled notifications, boot rescheduling, IST | App functionality; local alerts require permissions. Not a continuous background microphone recorder. |
| Sheets export | Optional account-configured Apps Script/webhook | User-directed transfer to configured Sheet. Existing exported copies are not deleted by deleting the Recall account. |
| Hosting/extraction providers | Vercel, Supabase; OpenAI when server configured | Determine collection/sharing and service-provider exceptions using actual contracts; service-provider processing must still be disclosed appropriately. |
| Web Push | Optional browser subscriptions + five-minute backend scheduler | Distinguish browser pushes from native local alarms; no native FCM integration in current Flutter app. |
| Ads/payments/analytics | No advertising, billing or analytics SDK in observed Flutter dependencies | Do not claim absence of hosting operational logs. No admin activity dashboard added. |
| Encryption | HTTPS release API; secure device session; passwords hashed | Confirm provider at-rest arrangements before making broader encryption claims. |
| Deletion | Authenticated, password-confirmed DELETE /api/account plus web page/support email; schema cascades | Local verification and historical build 7 disposable-account live tests passed; current public deletion capability reports available. Final device acceptance and actual backup/log retention still require owner confirmation. Owner must define backup/log retention and fulfill support requests. |

## Permissions justification

- `RECORD_AUDIO`: speech recognition explicitly started by user. Request at use; manual entry if denied.
- `POST_NOTIFICATIONS`: task reminders, requested through Settings.
- `SCHEDULE_EXACT_ALARM`: user-granted special access for precisely timed reminders; app does **not** declare `USE_EXACT_ALARM`. When unavailable, UI warns timing may be delayed. Answer any Play declaration based on this actual permission, not a different restricted permission.
- `RECEIVE_BOOT_COMPLETED`: reschedule native reminders after reboot (physical reboot test pending).
- Bluetooth permissions: speech/headset integration; review merged manifest and device prompts.
- `INTERNET`: account authentication, save/sync and text extraction requests.
- No camera, location or device contact-book permission in the current app manifest.

## Owner actions

1. Approve the Recall-specific privacy/terms copy, resolve actual backup/log retention and service-provider arrangements.
2. Complete Data safety, ads, content rating, target audience, app access and any Console declarations truthfully. Audience/content-rating answers are not invented here. The product is designed for professional commitments; no child-targeting claim is made.
3. Verify the live deletion flow with disposable records before asserting deletion availability.
4. Provide support coverage for deletion/access requests from users who cannot log in. Never ask them to send passwords.
5. Recheck this worksheet whenever adding analytics, admin activity tracking, server transcription in native, billing or new SDKs.
