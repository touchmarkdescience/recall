# Recall Android 1.0.9 — version code 13

## Play release notes

<en-US>
Create your account securely inside Recall.
Mark tasks completed or snooze reminders for five minutes directly from notifications.
Offline notification actions are kept on your phone; pending completions sync when you reopen Recall online.
</en-US>

## Release scope

- Native Google reCAPTCHA signup; website signup is no longer required by the native app.
- Android notification actions: Mark completed and Remind in 5 minutes. Expand a real task notification to see the buttons.
- Account-owned pending completions and local snoozes survive reloads. Snoozing leaves the original task due time unchanged.
- Uses the existing production API at https://recall.touchmarkdes.com and the existing Android upload key.

## Verification and rollout

- Flutter analysis: no issues; all 70 Flutter tests passed on 11 November 2026.
- Signed release bundle and artifact verification: see android-1.0.9-build13-verification.json when generated.
- Physical iPhone tests passed as reported by the owner; these do not establish Android behavior.
- Physical Android native signup and notification-button acceptance remain unverified for this release.
- Upload to Play Internal testing first. The Android CAPTCHA key is configured for Play-distributed builds; sideloaded signup is not a substitute for this test.
- On the Play-installed build, test signup, existing-account login, speech/save, closed-app reminders, offline five-minute snooze, and offline completion followed by online app resume. Check all three action types.
- Review Play Data safety for the added Google SDK using DATA_SAFETY.md and Google's SDK disclosures before production rollout.
- Keep the existing reviewer account working. No production rollout or Play upload has been performed by this preparation.
- Version code 13 is above the codes recorded in the local release history; Play Console must confirm it has not already been used.

No server credentials, signing passwords, or keystore should accompany the release artifact.
