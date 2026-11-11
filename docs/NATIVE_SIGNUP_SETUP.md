# Recall: configure signup inside the app

## What changes for users

Create account stays in Recall. The native Google SDK checks the signup, the backend verifies the result, and a successful account creation signs the user in automatically. No browser signup or email verification is added. Website signup keeps its existing v3 check. Existing accounts keep signing in normally.

Implementation is local and not deployed. Real Google/device verification requires the configuration below. Public site keys alone are not enough: the backend also needs the project ID and a server-only API credential.

## 1. Android key — start here

### Created configuration — 11 November 2026

- Owner account: `mohan@touchmarkdes.com`, organization `touchmarkdes.com`.
- Dedicated project: **Recall**, project ID `recall-514411`.
- reCAPTCHA Enterprise API: enabled by the owner.
- `Recall iOS production`: created for bundle ID `com.touchmarkdes.recall`, with
  bundle verification enabled. No fixed test score was enabled.
- `Recall Android production`: created for package `com.touchmarkdes.recall`,
  with package verification enabled and outside-Play distribution disabled.
- Public mobile keys and project/app IDs were added to ignored `.env.local`.
- No billing account was attached. The console reports a limited free allowance.
- Server credential `Recall signup verification server`: created with access
  restricted to **reCAPTCHA Enterprise API**. No application/referrer restriction
  was applied because this credential is used by the Vercel server, not a browser.
- Owner must copy the credential directly from Google Cloud into ignored
  `.env.local` and Vercel's Production `RECAPTCHA_ENTERPRISE_API_KEY` setting.
- Owner reported saving the credential in both places. A real Google API probe
  using the local credential returned HTTP 200 and correctly classified a
  deliberately invalid token as `MALFORMED`. This verifies credential/API access,
  not successful native signup or a valid SDK assessment.
- Vercel environment/backend deployment and real native signup verification
  remain pending. Key creation alone does not activate signup.

The server credential must remain private; do not include it in this document.

1. Open [Google Cloud reCAPTCHA](https://console.cloud.google.com/security/recaptcha) and select the company project that will own Recall's keys. Record its **Project ID**, not its display name.
2. Enable **reCAPTCHA Enterprise API** in that project's API Library if it is not enabled.
3. On the reCAPTCHA page (also called Google Cloud Fraud Defense), open **Keys → Create key**. Use a display name such as `Recall Android production` and select **Android**.
4. Add package **`com.touchmarkdes.recall`**. Keep package-name verification enabled. For the Play Store release, leave support for distribution outside Google Play off; create a separate staging key if sideload testing is needed.
5. Create the key and copy its key ID. This is `RECAPTCHA_ANDROID_SITE_KEY`, a public site key. Keep the existing website key and secret unchanged.

Google's [mobile key instructions](https://docs.cloud.google.com/recaptcha/docs/create-key-mobile) describe these settings. Do not use a test key with a fixed score for production.

## 2. Server credential

In the **same Google Cloud project**, open **APIs & Services → Credentials → Create credentials → API key**. Restrict its API access to **reCAPTCHA Enterprise API**. A browser-referrer restriction is unsuitable for a server credential. If using an IP restriction, it must match the deployment's real outgoing IP addresses.

Put the value only in ignored local `.env.local` and Vercel's **Production** server environment as `RECAPTCHA_ENTERPRISE_API_KEY`. Never put it in a `NEXT_PUBLIC_` variable, Flutter define, committed file, screenshot or chat. Public mobile site keys are different from this credential.

Google supports API-key authentication for assessments on external cloud hosts; see [mobile server assessments](https://docs.cloud.google.com/recaptcha/docs/create-assessment-mobile).

## 3. Configure Recall's server

Add these **new** environment variables locally and to the Recall Vercel project:

```dotenv
RECAPTCHA_ENTERPRISE_PROJECT_ID=your-google-cloud-project-id
RECAPTCHA_ENTERPRISE_API_KEY=your-server-only-api-key
RECAPTCHA_ANDROID_SITE_KEY=your-android-public-site-key
RECAPTCHA_ANDROID_PACKAGE_NAME=com.touchmarkdes.recall
```

Retain the existing website variables and `RECAPTCHA_SIGNUP_ENABLED=true`. `ABUSE_PROTECTION_ENABLED` controls rate/budget limits separately. Use the existing `RECAPTCHA_MIN_SCORE` (default `0.5`) for both signup providers; do not turn off verification to work around a setup problem.

The app obtains only public mobile site keys from `/api/security`; no CAPTCHA key needs to be built into its source. The endpoint advertises a platform key only when that platform's server verification settings are present. It never returns the project API credential.

Deploy the updated backend before building/releasing the app update. The Play build script now refuses a regular store build if the live backend does not advertise native Android signup readiness. A `--candidate` build is explicitly not release-ready.

## 4. iPhone key

Create a separate **iOS** key in the same project, for approved bundle ID **`com.touchmarkdes.recall`**. Keep bundle-ID verification enabled. The project now uses this permanent ID, replacing its old placeholder.

Add:

```dotenv
RECAPTCHA_IOS_SITE_KEY=your-ios-public-site-key
RECAPTCHA_IOS_BUNDLE_ID=com.touchmarkdes.recall
```

The approved Google Flutter package requires iOS 15 or later. Its Android SDK is compiled with Kotlin 2.4 metadata, so Recall’s Kotlin Gradle plugin is aligned to 2.4.20; the Gradle, Android Gradle plugin and Flutter versions stay unchanged. Apple signing and real-iPhone tests remain separate from Android release readiness.

## 5. Verify and release

- Automated tests mock Google; they are not evidence of a valid production assessment.
- With configured keys and a deployed backend, test **fresh account creation inside a Play-installed internal-test build**. Confirm account creation, automatic sign-in, sign-out/sign-in, and account-owned records.
- Test offline/provider-failure paths: an error must retain entered details, allow retry, and never create an unverified account. A new submission must obtain a fresh token.
- Keep Google testing/staging keys separate from production. A key limited to Google Play may reject a sideloaded APK.
- Publish the updated privacy page and review [Google's native SDK data-disclosure guidance](https://docs.cloud.google.com/recaptcha/docs/disclosure-requirements-android) against Play Data safety before releasing the SDK-bearing update. See `mobile/release/DATA_SAFETY.md`.
- Use a new, unused Play version code. Do not upload the old build again. Production users will need to install the updated app; existing users can still sign in meanwhile.

Google's assessment guide currently includes the first 10,000 assessments per month at no charge; consult the project's current quota/billing settings before enabling paid usage beyond that. No billing or cloud settings are changed by this code.

## Security boundary

The server verifies the token with Google and checks validity, `signup` action, configured site key, package/bundle identity and risk score. It never trusts a native header, a client-reported score or a client-reported success. Google enforces token expiry/reuse. Missing keys, invalid tokens and provider failures reject signup. No database migration or account-data copy is needed.
