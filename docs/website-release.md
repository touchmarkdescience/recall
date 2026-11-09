# Recall public website release — 9 November 2026

Owner: Touchmark Descience Pvt Ltd. Support: mohan@touchmarkdes.com.
Planned domain: https://recall.touchmarkdes.com. Recall is free to use, without a subscription or payment. Admin activity features are deferred.

## Routes

- `/`: public landing for signed-out visitors; signed-in users retain their dashboard entry point.
- `/app`: existing web app/signup. `/app?mode=login`: sign-in.
- `/privacy`: Recall-specific privacy policy, including phone recognition vs web transcription and optional Sheets export.
- `/delete-account`: authenticated password-confirmed deletion without installing the app; support email for users unable to sign in.
- `/support`: help and notification troubleshooting.
- `/terms`: free use, user responsibilities and service limitations.

The site uses the existing Recall icon, light/mint/gold theme and relative page links. Old signed-out hash bookmarks such as `/#capture` are forwarded to `/app#capture`; marketing anchors remain on the landing page. No analytics SDK, admin dashboard, billing or fabricated app-store download link is included. Android release is marked as being prepared, iPhone release as planned.

## Backend changes included

- `DELETE /api/account`: requires an authenticated session, current password and `confirmation: "DELETE"`; deletes only the authenticated user, ignoring client-supplied user IDs. Existing foreign-key cascades remove associated active records.
- Both SQLite development and Supabase production adapters are implemented. No schema migration is introduced; `supabase/schema.sql` specifies existing user cascades. Verify the deployed database matches this schema before relying on deletion.
- `/api/me` advertises `accountDeletionAvailable: true` on this server build.
- Native Bearer sessions supported alongside existing cookie authentication; native login/registration can receive a token. Browser cookie behavior is retained.
- Pending relative-reminder parser corrections and regression tests are included, including “in another 3 minutes.”

## Verification

- `npm run typecheck`: pass.
- `npm run test:extract`: extraction, clock-time, reminder offsets and relative timing regressions pass.
- `npm run build`: production build passes; all routes listed above included.
- `node --env-file=.env.local scripts/test-account-deletion.mjs`: passed on local SQLite with disposable accounts. Covered wrong password, missing confirmation, unauthenticated request, cross-account isolation, cascade deletion of all user tables, and old-session revocation. Never point this disposable test at production.
- Local Chrome: landing desktop inspected, phone-width layout checked, sign-in link opened correct mode, privacy/deletion page links inspected. Actual physical-device testing remains separate.
- Production Supabase deletion and new-domain TLS/API behavior: pending deployment and live disposable-account verification. No existing production data was deleted.

## Hosting/merge steps

1. Manually merge this source repo into the existing deployment repo as usual. Keep the Vercel GitHub connection separate; do not switch it to the source account.
2. In the existing Recall Vercel project, add `recall.touchmarkdes.com` under Settings → Domains. Add exactly the DNS record Vercel shows at the domain provider. Wait for verified HTTPS.
3. Deploy the merged code with the existing Supabase/server secrets preserved. These pages require no additional API key.
4. Open each public route above while signed out. Check `/app` login, signup and existing account data. The same live credentials work; users must sign in again on the new origin.
5. Verify `/api/me` advertises deletion capability, then exercise account deletion using a disposable account only. Check real Supabase cascade constraints first.
6. Owner reviews policy/terms copy and confirms actual hosting backup/log retention and support procedures. Optional external Sheet copies are not erased by Recall deletion.
7. Keep the old Vercel hostname active for native candidates and the existing reminder cron endpoint. Browser Web Push needs permission/subscription setup on the new origin.
8. Add a Google Play link after the listing is genuinely available. Rebuild the native store app against the custom domain only after its API is verified.

The Flutter application, private upload signing files and Android artifacts are intentionally excluded from this website-only commit.
