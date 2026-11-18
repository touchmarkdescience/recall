# Recall mobile UI concepts

These are visual proposals for a native iPhone and Android app. They are not implemented screens or functional prototypes. The design keeps Recall's existing icon and warm cream, evergreen, mint, and gold palette.

## First-run flow

1. `00-loading.png` — Show while restoring the signed-in session and loading today's actions. Move on automatically when ready; show an error/retry state if loading fails.
2. `01-onboarding-speak.png` — Explain quick voice capture after a call.
3. `02-onboarding-reminders.png` — Explain meetings, follow-ups, and alerts.
4. `03-onboarding-memory.png` — Explain contact history and pending promises.

The three onboarding slides appear only on first launch. Users can swipe or tap Continue, use Skip on the first two slides, and enter sign-in from Get started. Never show the slider on every login.

## Main flow

5. `04-today.png` — Open here after login. Show today's actions and a prominent Speak control. If there are no actions, show the positive next-prospect message instead of sample tasks.
6. `05-capture.png` — Show the live transcript and a genuinely moving waveform while recording. Display elapsed time against the one-minute limit; stop automatically at the limit. The illustration is a single still frame of that state.
7. `06-review.png` — Let the user correct transcript, optional person, action, due time, and reminder before saving. A clear spoken date/time stays collapsed until Edit is tapped. Conflicting times require a choice.
8. `07-followups.png` — Filter Today, Upcoming, and Done; complete or open an action. The empty-state message is shown only when the selected list is empty.

All times are shown in IST. Native iOS and Android layouts should use their platform safe areas, text scaling, keyboard behavior, and notification permission flows. The mockups are visual direction, not a purchased UI kit or copied assets.
