# Recall website signup and resource protection

Status: implemented and locally verified; **not enabled in production**. The owner reported both Supabase SQL files succeeded on 9 November 2026. No package added. No native APK/AAB change.

## Selected flow

The owner selected Google reCAPTCHA v3. New app users create an account at https://recall.touchmarkdes.com/app, then sign in to the native Recall app. Existing app sessions/logins do not need a CAPTCHA. The released app's signup request will receive a message directing users to the website after enforcement is enabled. Its existing error text is not a new clickable registration button.

Do not exempt a request because it has a native header, omits Origin, or uses a particular User-Agent. These are forgeable. The server requires a verified CAPTCHA for every registration once signup protection is enabled. Existing Google Play review credentials use the ordinary sign-in path; no reviewer bypass exists.

## Keys: local and Vercel

Use the team's **reCAPTCHA v3 site key and secret-key pair** for the standard Siteverify API. Do not put an Enterprise Google Cloud API key in the secret field. If the team supplies only Enterprise credentials, stop and adapt to that verified integration rather than guessing.

1. In Google reCAPTCHA Admin, select the v3 key and add `recall.touchmarkdes.com` and `localhost` to its allowed domains. No scheme, port or URL path. Use a separately controlled development key if the team prefers.
2. Add the following to the ignored `.env.local` file and the Recall Vercel project's Production environment:

```env
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=replace_with_site_key
RECAPTCHA_SECRET_KEY=replace_with_secret_key
ABUSE_PROTECTION_ENABLED=false
RECAPTCHA_SIGNUP_ENABLED=false
RECAPTCHA_ALLOWED_HOSTNAMES=recall.touchmarkdes.com
RECAPTCHA_MIN_SCORE=0.5
```

Only the site key is public. Keep secrets in local/Vercel environment storage; never paste them into chat, source, screenshots or release bundles. The score threshold is configurable between 0.1 and 1; 0.5 is a starting point requiring observation of real traffic, not a guarantee against bots. Email syntax is checked; **email ownership verification is not implemented**.

Use `http://localhost:3000` for a development key that allows localhost. Merely allowing localhost does not necessarily allow the distinct hostname 127.0.0.1 in Google's key settings. The server permits local hostnames only outside production. The old Vercel hostname and arbitrary previews cannot complete signup unless explicitly configured with the correct Google and server hostname allowlists. Existing logins are separate.

## Database setup before activation

Apply `supabase/abuse-protection-migration.sql` in the supplied Recall project's Supabase SQL editor (`jwhgbzdepxoskdzbtxnb`). Review the file first. It creates only:

- `recall_abuse_buckets`, containing keyed hashes, counts and expiry times;
- `recall_reserve_budget(jsonb)`, restricted to service_role;
- the expiry index and grants/RLS for that independent counter table.

It does not change account/contact/conversation/action columns or delete their records. The counters are shared across Vercel instances and reservations for a request are atomic. The application fails closed with 503 if an enabled limiter cannot reach its store; it never falls back to process memory in production. After the migration, run `supabase/abuse-protection-check.sql` in the same SQL editor. It checks the first allowed reservation, the second rejected reservation and service-only execution grants, then rolls back its test records. The owner confirmed the migration and the live SQL verification completed successfully. This verifies the checked reservation behavior and grants via that SQL editor; live PostgreSQL concurrency has not been load-tested. No PostgreSQL server/CLI was available locally; SQLite concurrency tests are separate evidence.

Local development without Supabase uses file-backed SQLite with atomic transactions and a busy timeout. Tests use disposable temporary databases, not the user's saved records.

## Activation order

1. Keep both protection flags false while deploying the source and configuring keys.
2. Run the reviewed counter migration in Supabase. Keep existing server credentials and the Vercel repository connection unchanged.
3. Redeploy/restart so the latest API and public site key are present. `/api/security` reports `captchaRequired:false` while both flags are false.
4. **While Google Play review is pending:** set `RECAPTCHA_SIGNUP_ENABLED=true` and leave `ABUSE_PROTECTION_ENABLED=false`, then redeploy. CAPTCHA applies to new account creation only. No new general request/login/AI quota is enforced in this mode. Existing native/reviewer sign-in and task flows use the normal application code.
5. Test an actual website signup and existing native sign-in. Give Google Play a working existing account in App access; the reviewer should not need to create an account or complete a CAPTCHA.
6. **After Google review:** set `ABUSE_PROTECTION_ENABLED=true` and redeploy to enable the durable rate/usage controls. Full protection also always requires signup CAPTCHA, even if its separate flag is false. Test quotas and normal voice/manual saves. Do not run a signup-spam/load test against production users.
7. Check Google's score distribution and legitimate signup failures; adjust limits/threshold deliberately. Set provider billing/budget alerts where supported.

Until real signup testing is complete, do not claim the live integration is verified. Turning ABUSE_PROTECTION_ENABLED off removes the new quotas; signup CAPTCHA stays on if RECAPTCHA_SIGNUP_ENABLED remains true. Turning both flags off reopens registration without CAPTCHA. If a rollout problem occurs, diagnose configuration/store availability rather than silently bypassing verification. A whole account-creation outage is not silently bypassed.

## Implementation

- v3 executes when the user submits, not when they start typing. The server calls Google's Siteverify and verifies success, expected `signup` action, allowed hostname and numeric score. Missing score, low score, provider errors (including over-quota responses), replay/expired tokens and provider unavailability are rejected. Tokens/scores from the client are not trusted or logged.
- No checkbox challenge is shown by v3. Signup displays Google's attribution; the standard badge is not hidden. Script/network failures show Retry and preserve the typed form.
- Signup and login have network/identity budgets; expensive extraction/ask/transcription have per-account and shared site budgets. Retries consume attempts, and quotas are not refunded after provider errors. Transcription's existing bounded provider retry can make more than one upstream request per app request; limits are request budgets, not exact dollar caps.
- General JSON reads are capped at 64 KiB before parsing. Existing audio JSON is capped at 2,900,000 bytes and still uses the existing audio schema. Password length is capped at 1,024 characters. Questions are capped at 2,000 characters. OpenAI fetches have a 15-second timeout and bounded output; existing STT timeouts remain.
- 429 responses include Retry-After. Form/transcript/audio state remains on the device after rejection. Native clients can display the server's friendly error without updating the APK.
- Vercel's overwritten X-Forwarded-For is used only when `VERCEL=1`. Arbitrary client IP headers are not trusted elsewhere; other hosts conservatively share a bucket until their trusted proxy is explicitly designed. A proxy in front of Vercel can affect which IP is seen. Shared office networks may need more generous limits.

## Starting limits (adjustable via server env)

| Environment variable | Default |
|---|---:|
| ABUSE_REQUEST_MINUTE | 120 per network address / minute |
| ABUSE_SIGNUP_HOUR | 5 per network address / hour |
| ABUSE_SIGNUP_DAY | 15 per network address / day |
| ABUSE_SIGNUP_GLOBAL_DAY | 500 successful-CAPTCHA signup attempts / site / day |
| ABUSE_LOGIN_QUARTER_HOUR | 30 per network address / 15 minutes |
| ABUSE_LOGIN_IDENTITY_QUARTER_HOUR | 10 per network-address/email pair / 15 minutes |
| ABUSE_EXTRACT_MINUTE / ABUSE_EXTRACT_DAY | 20 / 150 per account |
| ABUSE_ASK_MINUTE / ABUSE_ASK_DAY | 10 / 100 per account |
| ABUSE_TRANSCRIBE_MINUTE / ABUSE_TRANSCRIBE_DAY | 6 / 30 per account |
| ABUSE_AI_GLOBAL_DAY | 1,000 combined extraction/ask/transcription requests / site / day |

Budget windows use fixed UTC epoch boundaries; these are separate from IST task dates. HMAC identifiers use `ABUSE_HASH_SECRET` if set, otherwise an existing server-only Supabase/reCAPTCHA secret. Rotating that secret resets the effective budgets; no raw email/IP is written into the counter keys. Expired counter rows are cleaned during subsequent requests after a one-day grace period; if traffic stops, cleanup waits until it resumes. No activity/admin dashboard was added.

These are application controls, not full DDoS protection or email verification. Edge firewall/rate controls and provider budget caps remain useful; a bot can still send requests to a rejected endpoint. Distributed traffic can evade an individual-IP allowance, so shared quotas are also enforced.

## Verification

- `npm run test:security`: nine grouped checks, including low/missing score, wrong hostname/action, provider errors, token revalidation, bounded streaming bodies and durable reservations across two independent processes. Google responses are mocked in these tests.
- `node scripts/test-security-http.mjs`: isolated localhost HTTP check (never production) with dummy keys, no real provider call and no production environment/account data. Confirms native-header bypass rejection, foreign-Origin rejection, oversized-body rejection, 401 login failures followed by 429/Retry-After. No account is created.
- `scripts/test-review-access.mjs` tests the normal native sign-in/extraction flow with signup CAPTCHA on and usage limits off in an isolated temporary database: 20 successful sign-ins and 25 extractions, with a synthetic account removed afterward. It does not use actual Google reviewer credentials.
- Typecheck, extraction regressions and production build must pass before handoff. No claim of real reCAPTCHA completion, live Supabase counter execution or real-browser visual verification until those are separately performed with configured keys.

## Official references

- v3: https://developers.google.com/recaptcha/docs/v3
- Server verification: https://developers.google.com/recaptcha/docs/verify
- Badge/cookies/quota details: https://developers.google.com/recaptcha/docs/faq
- Supabase functions/privileges: https://supabase.com/docs/guides/database/functions
- Trusted Vercel headers: https://vercel.com/docs/headers/request-headers

## Handoff state — 9 November 2026

- Local Google v3 keys detected without printing values. Google rejected an intentionally invalid probe token and did not report an invalid secret. This is not proof of a successful human/browser assessment.
- Local `.env.local` protection is enabled for SQLite development; `http://localhost:3000/api/security` reports CAPTCHA required with a site key present.
- Production variables are being updated by the owner. CLI write attempts failed/cancelled and did not establish production readiness; no automatic deployment or activation was performed.
- The owner reported successful migration and SQL verification. Secrets remain server-side; no raw keys are committed.
- After manually merging the latest source into the deployment repo, enable only RECAPTCHA_SIGNUP_ENABLED during Google review. Keep ABUSE_PROTECTION_ENABLED false until review completes; then enable it separately. Test an actual website signup and native sign-in. Google v3 rejection has no checkbox fallback; legitimate low-score failures may require threshold review/support.
