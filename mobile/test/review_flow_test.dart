import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:timezone/data/latest.dart' as tz_data;
import 'package:recall_mobile/main.dart';
import 'package:recall_mobile/recall_api.dart';

class ReviewApi extends RecallApi {
  final List<(String, Map<String, dynamic>)> requests = [];
  ReviewApi() : super(null);
  @override
  Future<Map<String, dynamic>> post(
    String route,
    Map<String, dynamic> body,
  ) async {
    requests.add((route, body));
    if (route == 'extract') {
      return {
        'contactName': '',
        'summary': 'Send the report',
        'actions': [
          {
            'kind': 'reminder',
            'title': 'Send the report',
            'dueAt': DateTime.now()
                .add(const Duration(days: 1))
                .toUtc()
                .toIso8601String(),
            'timeSpecified': true,
          },
        ],
      };
    }
    return {'ok': true};
  }
}

Map<String, dynamic> extraction() => {
  'contactName': 'Arjun',
  'summary': 'Discuss the PPT',
  'actions': [
    {
      'kind': 'meeting',
      'title': 'Discuss the PPT',
      'dueAt': DateTime.now()
          .add(const Duration(days: 1))
          .toUtc()
          .toIso8601String(),
      'reminderMinutes': 60,
    },
  ],
};

void main() {
  setUpAll(tz_data.initializeTimeZones);
  testWidgets(
    'Compact review edits person/action and saves the actual values',
    (tester) async {
      final api = ReviewApi();
      bool saved = false;
      await tester.pumpWidget(
        MaterialApp(
          home: ReviewPage(
            api: api,
            transcript: 'Discuss the PPT tomorrow',
            extracted: extraction(),
            contacts: const [],
            onSaved: () async {
              saved = true;
            },
          ),
        ),
      );
      expect(find.byType(TextField), findsNothing);
      expect(
        find.byKey(const ValueKey('save-note')).hitTestable(),
        findsOneWidget,
      );
      await tester.tap(find.text('Person'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Use Guest, without a name'));
      await tester.pump();
      await tester.tap(find.text('Apply changes'));
      await tester.pumpAndSettle();
      expect(find.text('Guest'), findsOneWidget);
      await tester.ensureVisible(find.text('Action'));
      await tester.tap(find.text('Action'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byType(TextField),
        'Discuss the investor deck',
      );
      await tester.ensureVisible(find.text('Apply changes'));
      await tester.tap(find.text('Apply changes'));
      await tester.pumpAndSettle();
      expect(find.text('Discuss the investor deck'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('save-note')));
      await tester.pumpAndSettle();
      expect(saved, isTrue);
      final body = api.requests.single.$2;
      expect(body['contactName'], '');
      expect(body['contactId'], '');
      final action = (body['actions'] as List).single as Map;
      expect(action['title'], 'Discuss the investor deck');
      expect(action['timeSpecified'], isTrue);
      expect(action['reminderMinutes'], 60);
    },
  );

  testWidgets('Editing transcript refreshes details before saving', (
    tester,
  ) async {
    final api = ReviewApi();
    await tester.pumpWidget(
      MaterialApp(
        home: ReviewPage(
          api: api,
          transcript: 'Original words',
          extracted: extraction(),
          contacts: const [],
          onSaved: () async {},
        ),
      ),
    );
    await tester.tap(find.text('Edit text'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byType(TextField),
      'Remind me to send the report tomorrow.',
    );
    await tester.tap(find.text('Apply changes'));
    await tester.pumpAndSettle();
    expect(find.text('Save reminder'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('save-note')));
    await tester.pumpAndSettle();
    expect(api.requests.map((request) => request.$1).toList(), [
      'extract',
      'save',
    ]);
    expect(
      api.requests.last.$2['transcript'],
      'Remind me to send the report tomorrow.',
    );
    expect(
      (api.requests.last.$2['actions'] as List).single['title'],
      'Send the report',
    );
  });

  testWidgets('Removing the last action allows a conversation-only note', (
    tester,
  ) async {
    final api = ReviewApi();
    await tester.pumpWidget(
      MaterialApp(
        home: ReviewPage(
          api: api,
          transcript: 'A conversation with Arjun',
          extracted: extraction(),
          contacts: const [],
          onSaved: () async {},
        ),
      ),
    );
    await tester.ensureVisible(find.text('Action'));
    await tester.tap(find.text('Action'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Remove action'));
    await tester.pumpAndSettle();
    expect(find.text('Save note'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('save-note')));
    await tester.pumpAndSettle();
    expect(api.requests.last.$2['actions'], isEmpty);
  });
}
