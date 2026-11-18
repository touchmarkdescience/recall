# Web performance comparison — 18 November 2026

Compared previous revision `8d63f65` with latest `1a9755e`. Fetch and fast-forward pull confirmed the checkout was already current.

## Result

Parallel startup and historical-note reads improve data readiness. Save/update performance is essentially unchanged. Fix the two startup-state regressions below before wider rollout.

| Operation | Before | After | Interpretation |
| --- | ---: | ---: | --- |
| Authenticated startup data ready | 229.9 ms | 115.2 ms | 50% faster |
| Dashboard with 330 actions | 283.0 ms | 172.7 ms | 39% faster |
| Save API | 108.9 ms | 119.5 ms | No demonstrated improvement |
| Update API | 113.2 ms | 117.6 ms | No demonstrated improvement |
| Foreground database requests per write | 2 | 2 | Unchanged |
| Concurrent historical-note batches | 1 | 3 | Three batches in both fixtures |

Small write timing differences from these warm runs do not establish a production regression. The write paths did not change.

## Method and limits

Both revisions were built with production Next.js (`build --webpack`) in isolated archive directories. The benchmark called actual HTTP routes against the same loopback PostgREST fixture, with 50 ms latency per database request and seven warm samples after warm-up. Startup composed `/me` and `/dashboard` sequentially before and concurrently after, matching the respective client implementations. The large-dashboard fixture verified historical transcripts remained attached to their actions.

These are controlled route/data-readiness measurements, not browser paint times or production latency. They exclude real Supabase execution, internet latency, cold starts, external AI and physical-device notification delivery. No production writes, real credentials or external AI calls were used.

The new `benchmark-startup-performance.mjs` simulates timers and local object construction; it does not run the application or measure cached rendering. Its near-zero cache result must not be treated as measured app startup. The actual app still waits for `/me` before displaying the authenticated screen.

Raw results: `web-comparison-2026-11-18-before.json` and `web-comparison-2026-11-18-after.json` in this directory.

## Findings to fix

### P1: dashboard cache is not bound to an account

`src/components/App.tsx:57–63` loads one global `recall_dashboard_cache` with no account identity, expiry or schema validation. When a different account is authenticated, the previous dashboard can render before the new dashboard arrives, or remain visible if the read fails. Clearing on explicit logout does not cover expired sessions and all account transitions. Writes also do not consistently update this cached snapshot.

Recommended change: verify identity before loading an account-bound, validated cache; clear it on authentication failure, logout and deletion; keep it synchronized with confirmed mutations. Reuse the existing account/write guards when applying responses.

### P1: delayed startup read can restore a completed action

`src/components/App.tsx:82–91` starts the dashboard request but takes its WriteGuard read token only after the response resolves. If a completion finishes while that request is pending, the old pending snapshot receives a current token and passes `canApply`, restoring the completed action in the UI.

Recommended change: capture the read token before dispatch, and retain account, revision and latest-read checks through response application. Cover initial startup with the same protections as `refresh()`.

Both regressions were reproduced by executing the actual transpiled before/after App component logic with synthetic React hooks and deferred HTTP responses, using the real WriteGuard. They were absent before and present after. This is not a live account exposure test or browser rendering measurement. Evidence: `web-startup-review-2026-11-18.json`; reproduction: `scripts/review-web-startup.mjs --before=<before-source> --after=<after-source>` with Node's `--experimental-strip-types` flag.

## AI and scope

The Gemini fallback and Indian-name prompt changes have not been tested against live speech or measured for latency/accuracy. Gemini extraction has no explicit request deadline in this implementation; bound its latency and measure actual fallback use before attributing speed gains to AI. Prompt changes alone do not establish recognition accuracy.

The shared backend extraction route can also affect native clients after deployment, even though this rollout is intended for web first. No native binary was changed during this review.

## Verification

- Both production builds passed.
- TypeScript typecheck passed.
- Security tests: 16 passed; write tests: 11 passed.
- Existing extraction/time/reminder regression scripts passed with external AI disabled.
- Controlled writes retained due dates and reminder offsets; failed fixture writes did not report success.
- The new startup replay demonstrated the two regressions above; existing suites do not cover them.

Only comparison tooling and evidence were added/updated during this review. Application code was not fixed, pushed or deployed.
