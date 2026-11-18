# Recall — production release handoff

## Current Android update — 17 November 2026

Prepare **1.0.10 (16)** over the owner's confirmed latest release **1.0.9 (13)**.
Use [CHANGELOG-1.0.10.md](CHANGELOG-1.0.10.md) for the current scope and Internal
testing checklist. The verified artifact is
`mobile/build/deliverables/Recall-Android-1.0.10-build16.aab`; actual results are
recorded in `android-1.0.10-build16-verification.json` once built and audited.
Do not upload a historical build 10/13 file as this update.

## Historical Android candidate — 11 November 2026

Version **1.0.9 (13)** replaces the build 10 instructions below for the next Android update.
Use `mobile/build/deliverables/Recall-Android-1.0.9-build13.aab` and
[CHANGELOG-1.0.9.md](CHANGELOG-1.0.9.md). Artifact evidence is in
[android-1.0.9-build13-verification.json](android-1.0.9-build13-verification.json).
Upload to Internal testing first; validate native signup and online/offline notification
completion/snooze on a physical Android phone. Review the updated Google SDK disclosure
in [DATA_SAFETY.md](DATA_SAFETY.md) before production. No Play upload or rollout has been performed.

## Historical production handoff — build 10

**Candidate: 1.0.8 (10)** · `com.touchmarkdes.recall` · Touchmark Descience Pvt Ltd · Free

Production countries: **India, Sri Lanka, Singapore, Malaysia**. English speech; all times shown in IST.

Start with [PRODUCTION_RELEASE.md](PRODUCTION_RELEASE.md). It is the current submission guide; build 7 reports/screenshots are historical evidence, not final build 10 device testing.

1. Merge/deploy the accompanying backend source from the source repo into the separate deployment repo.
2. Install/test build 10 through Internal testing. Confirm physical-phone voice, save and offline alerts.
3. Complete/verify Console declarations, working reviewer login, accurate screenshots and the four countries.
4. Include the tested build 10 in a Production release, review all changes, then submit through the owner's Console.

This package was prepared locally. It does not submit or publish to Google Play. It does not enable CAPTCHA. See the next-phase plan in PRODUCTION_RELEASE.md.

The ZIP contains only the signed AAB, public assets/certificate, notes and evidence. Signing keys/passwords and credentials are excluded. Back up the local upload keystore and ignored key.properties securely before release.
