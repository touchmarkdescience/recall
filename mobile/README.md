# Recall mobile (Flutter)

Native iPhone and Android client for Recall. The existing Next.js service remains the source of truth for accounts, contacts, conversations, extraction, and actions.

## Run for development

1. Install Flutter 3.41 or newer and the Android/iOS toolchain.
2. In the repository root, run `npm install` and `npm run dev` to start the Recall API.
3. In `mobile/`, run `flutter pub get`.
4. For an Android emulator, run `flutter run --dart-define=RECALL_API_URL=http://10.0.2.2:3000`.
5. For an iOS simulator, run `flutter run --dart-define=RECALL_API_URL=http://127.0.0.1:3000`.
6. For a physical phone, point `RECALL_API_URL` to the Mac's reachable LAN address with port 3000, or to the deployed HTTPS Recall server. Local HTTP is allowed in Android **debug** builds only; release builds should use HTTPS. The phone and Mac must be on the same network for LAN testing.

The app accepts the existing Recall sign-in session cookie as well as an explicit native session token, and stores the session in platform secure storage. No speech audio is uploaded. The phone's speech recognizer supplies English text, which is sent to `/api/extract` for action extraction and then `/api/save` after user review.

## Main flow

First launch: onboarding, then sign in. Today shows the current day's actions. Tap the microphone to dictate or type; the one-minute indicator stops at 1:00. Review the optional person, summary, each extracted action, due time, and reminder before saving. Conflicting spoken times require a choice. Actions can be marked done. People show their action board and conversation timeline. The account data and extraction require a network connection.

## Reminders

Tap **Settings → Phone reminders** to request notification permission. On Android, Recall also asks for exact alarm permission where supported; if unavailable, it schedules an inexact alarm that the OS may delay. The app schedules the next 50 timed pending actions at their chosen reminder offset in IST. Already scheduled local notifications can fire without Wi-Fi or mobile data. New or edited actions sync only when the app reaches the Recall server. The existing server Web Push scheduler is separate and continues serving the web app; native reminders do not rely on Web Push.

On iOS, notification delivery and speech recognition require tests on a real device. Native speech recognition can end a session when the OS detects silence. Recall resumes recognition within the same one-minute capture window and retains earlier words; Stop & review waits for final words. Physical-device testing is still needed for each phone recognizer. Users can correct the transcript before extraction. Some phone recognizers may themselves require internet access; Recall does not control that.

## Release setup

Android uses the permanent application ID `com.touchmarkdes.recall`. Configure local Android upload signing using `android/key.properties.example`; never commit the keystore or passwords. Apple signing/capabilities and the final iOS bundle identifier still need configuration. Test notification permission, exact alarm handling, reboot rescheduling, native speech recognition, and phone layouts on physical Android and iPhone devices before store distribution. Existing live accounts can sign in against the live API URL through the current session-cookie flow.

## Version 1.0.1 feedback changes

- Pull down on Today or Actions to refresh, including empty lists.
- Mark done hides the card immediately and shows an Updating notice until the server confirms. Account-specific pending updates are stored securely, survive refresh/restart, and resume on launch. A failed request restores the card and shows an error.
- Native speech results replace the current recording segment, so a repeated final result at Stop does not duplicate the transcript. Separate recordings still append.
- Open, Today, Overdue, Upcoming, Done and Archived summaries live on Actions. Summary buttons filter the list, newest records first. Counts show 0–99, then 99+, then 1k+ from 1,000. The bottom Actions tab also shows the open count.
- The three illustrated introduction slides appear once after this update, with Skip, swipe, Continue and Get started. Existing signed-in sessions are restored after the introduction.

## Version 1.0.2 mobile layout

Today replaces its duplicate Speak button with compact Today, Overdue and Done summaries. Each opens the matching Actions filter. Voice entry remains in the bottom Speak tab. Capture uses a sound-reactive waveform behind the centered microphone. Review details and any validation error remain in a fixed footer, including when the keyboard is visible; longer content scrolls above it.

## Version 1.0.3 reference UI

The native Today, capture, review and Actions screens now follow the supplied mobile concepts. Today keeps the compact summary cards and the bottom-navigation microphone, as requested. Capture has a sound-reactive orb and waveform, live words, Discard, and a fixed Stop & review / Review details footer. Review uses compact editable rows and a fixed Save footer. Editing the transcript rechecks extraction before saving; conflicting times still require confirmation. Action cards show a time rail, person/Guest, type and completion control. All six action categories and newest-first ordering remain available. Notification/settings icons open the real app settings, without implying unread notifications or enabled permissions.

`flutter test --no-pub tool/render_ui_test.dart` renders previews to `build/ui-previews/` on macOS using installed Arial fonts. Those previews contain sample records for visual review only; the application itself loads account records from the API. They are widget-rendered previews, not physical-device screenshots. No packages were added for this redesign.

## Version 1.0.4 reminders and manual entry

Actions now require a real future date and time. Use Add manually on Today/Actions for keyboard entry, or Set reminder time to repair an older untimed pending action. Short relative phrases such as “in another 3 minutes” are interpreted as exact timed actions. Settings reports actual native permission/scheduling state and provides a one-minute offline-delivery test. Cards are compact, with mint Follow-ups, blue Meetings and gold Reminders; their full text opens on tap. Primary filter buttons have visible borders, icons and active styling.

See [REMINDER_VERIFICATION.md](REMINDER_VERIFICATION.md) for the actual online/offline Android emulator delivery evidence and the physical-device/store-release gates.

## Version 1.0.6 (build 8)

See [release notes](release/CHANGELOG-1.0.6.md) for the native speech retention and explicit reminder timing fixes, verification, and physical-device checks. Android build 8 has been released to internal testing by the owner.

## Version 1.0.7 (build 9)

See [release notes](release/CHANGELOG-1.0.7.md) for long-note layout, Guest grouping, independent preparation reminders, casual same-day clocks and the fifteen-minute save compatibility fix. Separate preparation reminders are ordinary timed actions, so no new database column or constraint migration is needed. Both the event and its separate reminder are shown before saving and can notify. The optional `originalNote` dashboard field requires the accompanying backend update to expose complete linked transcripts in action details.
