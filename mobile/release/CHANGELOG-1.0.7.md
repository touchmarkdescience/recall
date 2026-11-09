# Recall 1.0.7 (Android build 9)

## Changes

- Long review actions use the full width beneath their label. The full transcript is readable in review; Save remains pinned.
- Action detail sheets are bounded to the safe screen area, scroll, and use a readable 19px title. Exact duplicated whole passages from legacy records are suppressed only in previews; original stored words are not rewritten.
- People includes a Guest group for nameless actions and Guest conversation history from the existing account-scoped dashboard API. The dashboard currently returns the latest 30 conversations; this remains the history limit for Guest. No synthetic contact is inserted into the database.
- Native timing recognises “set a reminder for tonight” as well as “remind me.” An explicitly dated alert cannot inherit tomorrow from an earlier meeting sentence.
- Explicitly timed preparation today and a meeting tomorrow produce separate actions, each with its own due time and on-device notification.
- An untimed future meeting/call is retained as a separate draft that requires time confirmation. No 9 AM default is invented.
- Reminder editing offers “Separate reminder · choose any date & time.” This creates a separate, editable reminder rather than forcing preparation into a fixed meeting offset. Existing presets remain available. Uses the existing save API and schema.
- Reminder values include the date to distinguish tonight from tomorrow. Manual entry supports additional reminder drafts.

- “Today at 2:45” without AM/PM uses the next remaining occurrence today and shows an inference note for confirmation. Explicit AM/PM and tomorrow are not silently changed.
- A fifteen-minute advance is shown as a separate timed reminder and saved with an accepted zero offset. Incoming legacy 15-minute drafts are expanded similarly, avoiding the existing database offset restriction. The user sees both actions before saving; both may notify.
- Corrected “call with CMS Placement Officer” contact extraction.
- The web save endpoint gives a specific actionable message for the known unsupported-offset validation error instead of the generic retry message.

- The shared dashboard now includes the original transcript for linked actions, including older records, with owner-filtered lookups. The action sheet has an expandable Original note so the 500-character action-title limit does not hide the full saved note. This optional field requires deploying the accompanying backend changes; older servers still work without it.

## Verification

51 Flutter tests passed, including narrow-phone long text layout, Guest filtering, exact repeated preview, independent reminder save, and preparation/meeting scheduling. Flutter analysis, web extraction regressions, typecheck and production build checked separately during release preparation.

No new packages, database migration, or credential changes. Shared web parser changes remain local until committed, pushed and merged. Native compatibility guards work with the existing deployed API.

Physical Android/iPhone speech and notification delivery must be retested. Historical build 7 emulator notification evidence is not a build 9 device test. No production records were edited or repaired automatically.

## Retest

1. Review a long note on a narrow phone; verify the action uses the full width and Save stays reachable.
2. Open an old duplicated note; preview should show one copy. Original stored text remains available for editing.
3. People → Guest: check nameless pending/completed/archived actions and recent Guest notes.
4. Say: “Meeting tomorrow at 4 PM. Set a reminder tonight at 7:23 PM to prepare the documents.” Confirm two actions with the correct dates and clocks.
5. Say: “Today I met Anand sir. He wants a meeting tomorrow afternoon. Set a reminder tonight at 8 PM to confirm my availability.” Confirm tonight 8 PM and choose the meeting's exact time.
6. Reminder → Separate reminder: choose a date/time, edit its action text and save both actions. Test closed-app delivery without Wi-Fi/mobile data.

## Play release notes

<en-US>
Improved long-note review and action details.
Added Guest actions to People.
Fixed tonight/tomorrow reminder dates.
Choose separate preparation reminders at any date and time, alongside meetings.
Unclear meeting times now require confirmation.
</en-US>
