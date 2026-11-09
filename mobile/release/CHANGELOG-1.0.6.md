# Recall 1.0.6 (8) — voice capture and explicit reminders

## Reported issues and fixes

- Phone recognition sessions may end after a pause or return a fresh phrase rather than a cumulative transcript. Capture now retains the text buffer across native sessions and resumes listening within the same one-minute user-controlled window. Empty/stale callbacks cannot clear the current phrase. Ordinary partial revisions replace the current phrase; clear non-cumulative phrase resets preserve earlier words.
- Stop/Review used to return before the plugin's final result. Review now waits for final speech completion (bounded by the plugin's final-result timeout) before sending text for extraction. Late callbacks from previous cycles and repeated final callbacks do not append the note twice.
- Restart attempts are bounded for repeated empty/error sessions. Stop, the 60-second limit, backgrounding and disposal prevent an automatic restart. Temporary permission-dialog inactivity does not cancel an intended capture. Native speech service limitations and brief restart gaps still depend on the phone/provider; physical speech testing remains required.
- Exact reported text: “today I met Anand from SS TPL he wanted me to call him tomorrow with the proposal document so remind me tonight 6:00 p.m.” The explicit alert is today at 6 PM IST. Tomorrow's call is preserved in the original note and reminder instruction; a 9 AM call time is not invented. The client guard corrects this case against the current live extractor without needing a server deployment.
- Shared web extraction rules are also corrected locally. Explicit event and reminder times are interpreted in their own day context. Supported lead offsets stay one action; independent alert dates can become separate confirmable reminders. Ambiguous alternatives still require confirmation. Web parser source is not deployed by generating the mobile build.

## Validation

- Flutter analysis: no issues. Full suite: 36 tests passed, including simulated 24-second capture across three native sessions, partial resets, final-word flushing, restart/stop, stale callbacks, missing status callbacks, background/permission lifecycle, 60-second cap, typed entry and review request payloads.
- Web extraction regressions, TypeScript and Next production build passed. The exact Anand phrase resolves to 2026-11-09 18:00 IST with the fixed 9 November test reference; same-day and different-day meeting/reminder examples are covered.
- Audio recognition callbacks in the new automated tests are fake native-engine events, not a recording of a real speaker. Real-device voice recognition and delivery for this build must be retested. The build-7 offline notification report remains historical build-7 evidence, not proof of build-8 device testing.
- No new package, raw-audio upload, cloud transcription provider, schema change, production record edit or automatic Play rollout is introduced.

## Internal test update

Upload `Recall-Android-1.0.6-build8.aab` to a new internal testing release. Keep the same tester list. Suggested notes:

```text
<en-US>
Fixes disappearing or repeated text when phone speech recognition pauses.
Preserves the final spoken words before opening review.
Corrects explicit reminder times such as “tonight at 6 PM” when a note also mentions tomorrow.
Keeps typed entry and the one-minute voice limit.
</en-US>
```

After Google makes the release available, update through the existing internal test link. Keep Play Console, browser and phone on the enrolled Google account.

## Phone retest

1. Speak for 24–45 seconds with short pauses. Earlier words must stay visible after each pause. Stop and confirm the final sentence remains. Repeat start → stop → start → stop and check for duplicates.
2. Try the exact Anand example before 6 PM IST. Review must show a reminder at 6 PM today and retain the instruction about calling tomorrow. Confirm the time before saving. If 6 PM has already passed, edit to a future alert instead of expecting silent rescheduling.
3. Speak “meeting tomorrow at 6 PM, remind me one hour before.” Verify the meeting and 5 PM reminder. Conflicting “6 PM or 7 PM” instructions must remain unresolved until selected.
4. Stop manually and wait: the mic must not restart. Background the app during capture. Test the 60-second cap and manual typed entry.
5. Schedule a short actual reminder, close the app, disable connectivity and test native delivery. Check permissions and battery restrictions on the physical phone.
