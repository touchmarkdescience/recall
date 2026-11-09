import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recall_mobile/main.dart';
import 'package:recall_mobile/recall_api.dart';
import 'package:recall_mobile/action_view.dart';
import 'package:recall_mobile/recall_ui.dart';
import 'review_flow_test.dart' show ReviewApi, extraction;
import 'package:timezone/data/latest.dart' as tz_data;

class GuestApi extends RecallApi {
  GuestApi() : super(null);
  @override
  Future<Map<String, dynamic>> get(String route) async => {
    'interactions': [
      {
        'contactId': '',
        'summary': 'Guest preparation note',
        'occurredAt': '2026-11-09T10:00:00Z',
      },
      {
        'contactId': 'another',
        'summary': 'Named person note',
        'occurredAt': '2026-11-09T10:00:00Z',
      },
    ],
  };
}

void main() {
  setUpAll(tz_data.initializeTimeZones);
  test('Legacy exact repeated note is hidden only in its display', () {
    const text =
        'I am having meeting with aryapan tomorrow 3:00 p.m. regarding project presentation';
    expect(actionDisplayText('$text $text'), text);
    expect(
      actionDisplayText('Call Arjun then call Arjun about the proposal'),
      'Call Arjun then call Arjun about the proposal',
    );
  });
  testWidgets('Long review action uses the full width on a narrow phone', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(360, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final long = List.filled(
      10,
      'Prepare the presentation and send the proposal document.',
    ).join(' ');
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: RecallDetailRow(
              icon: Icons.task_alt,
              label: 'Action',
              value: long,
              expandedValue: true,
            ),
          ),
        ),
      ),
    );
    final label = tester.getRect(find.text('Action'));
    final value = tester.getRect(find.text(long));
    expect(value.top, greaterThan(label.bottom));
    expect(value.width, greaterThan(300));
    expect(tester.takeException(), isNull);
  });
  testWidgets('Guest opens nameless actions and account-owned guest notes', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: PeoplePage(
            api: GuestApi(),
            contacts: const [],
            actions: [
              RecallAction({
                'id': 'guest-action',
                'title': 'Prepare deck',
                'contactName': '',
                'status': 'pending',
                'dueAt': '2027-01-01T10:00:00Z',
              }),
            ],
          ),
        ),
      ),
    );
    await tester.tap(find.text('Guest'));
    await tester.pumpAndSettle();
    expect(find.text('Prepare deck'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('Guest preparation note'),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Guest preparation note'), findsOneWidget);
    expect(find.text('Named person note'), findsNothing);
    expect(tester.takeException(), isNull);
  });
  testWidgets(
    'An independent reminder is editable and saved alongside the meeting',
    (tester) async {
      final api = ReviewApi();
      await tester.pumpWidget(
        MaterialApp(
          home: ReviewPage(
            api: api,
            transcript: 'Discuss the PPT tomorrow',
            extracted: extraction(),
            contacts: const [],
            onSaved: () async {},
          ),
        ),
      );
      final reminder = find.textContaining('60 minutes before');
      await tester.scrollUntilVisible(
        reminder,
        200,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(reminder);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Custom time'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('OK'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('OK'));
      await tester.pumpAndSettle();
      expect(find.text('Save actions'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('save-note')));
      await tester.pumpAndSettle();
      final actions = api.requests.single.$2['actions'] as List;
      expect(actions.length, 2);
      expect(actions[0]['kind'], 'meeting');
      expect(actions[1]['kind'], 'reminder');
      expect(actions[1]['reminderMinutes'], 0);
      expect(
        DateTime.parse(actions[1]['dueAt']).isAfter(DateTime.now()),
        isTrue,
      );
      expect(actions[0]['dueAt'], isNot(actions[1]['dueAt']));
    },
  );
  testWidgets('Selecting fifteen minutes saves two accepted timed actions', (
    tester,
  ) async {
    final api = ReviewApi();
    await tester.pumpWidget(
      MaterialApp(
        home: ReviewPage(
          api: api,
          transcript: 'Prepare for the call',
          extracted: extraction(),
          contacts: const [],
          onSaved: () async {},
        ),
      ),
    );
    final reminder = find.textContaining('60 minutes before');
    await tester.scrollUntilVisible(
      reminder,
      200,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(reminder);
    await tester.pumpAndSettle();
    await tester.tap(find.text('15 min before'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('save-note')));
    await tester.pumpAndSettle();
    final actions = api.requests.single.$2['actions'] as List;
    expect(actions.length, 2);
    expect(
      actions.every(
        (a) => [0, 10, 30, 60, 1440].contains(a['reminderMinutes']),
      ),
      isTrue,
    );
    expect(
      DateTime.parse(
        actions[0]['dueAt'],
      ).difference(DateTime.parse(actions[1]['dueAt'])).inMinutes,
      15,
    );
  });
  testWidgets(
    'Legacy extracted fifteen-minute offset saves without the rejected value',
    (tester) async {
      final api = ReviewApi();
      final input = extraction();
      (input['actions'] as List).first['reminderMinutes'] = 15;
      await tester.pumpWidget(
        MaterialApp(
          home: ReviewPage(
            api: api,
            transcript: 'Prepare for the call',
            extracted: input,
            contacts: const [],
            onSaved: () async {},
          ),
        ),
      );
      await tester.tap(find.byKey(const ValueKey('save-note')));
      await tester.pumpAndSettle();
      final actions = api.requests.single.$2['actions'] as List;
      expect(actions.length, 2);
      expect(actions.every((a) => a['reminderMinutes'] == 0), isTrue);
      expect(
        DateTime.parse(
          actions[0]['dueAt'],
        ).difference(DateTime.parse(actions[1]['dueAt'])).inMinutes,
        15,
      );
    },
  );
  testWidgets(
    'Action sheet scrolls and exposes the complete original long note',
    (tester) async {
      final note = List.filled(
        30,
        'Prepare the full presentation and send the documents.',
      ).join(' ');
      final action = RecallAction({
        'id': 'long',
        'title': 'Prepare presentation',
        'originalNote': note,
        'kind': 'reminder',
        'status': 'pending',
        'dueAt': '2027-01-01T10:00:00Z',
      });
      await tester.pumpWidget(
        MaterialApp(home: Scaffold(body: ActionCard(action))),
      );
      await tester.tap(find.text('Prepare presentation'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Original note'));
      await tester.pumpAndSettle();
      expect(find.text(note), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
}
