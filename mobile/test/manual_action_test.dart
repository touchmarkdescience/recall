import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:timezone/data/latest.dart' as tz_data;
import 'package:recall_mobile/main.dart';
import 'package:recall_mobile/recall_api.dart';

class ManualApi extends RecallApi {
  final List<(String, Map<String, dynamic>)> requests = [];
  ManualApi() : super(null);
  @override
  Future<Map<String, dynamic>> post(
    String route,
    Map<String, dynamic> body,
  ) async {
    requests.add((route, body));
    return {'ok': true};
  }
}

void main() {
  setUpAll(tz_data.initializeTimeZones);
  for (final existing in [false, true]) {
    testWidgets(
      existing
          ? 'An older untimed action can be repaired without creating a duplicate'
          : 'Manual entry requires a real time and saves without speech or extraction',
      (tester) async {
        final api = ManualApi();
        final record = existing
            ? RecallAction({
                'id': 'old',
                'title': 'Send the report',
                'kind': 'follow_up',
                'status': 'pending',
                'timeSpecified': false,
              })
            : null;
        await tester.pumpWidget(
          MaterialApp(
            home: ReviewPage(
              api: api,
              manual: true,
              existingAction: record,
              transcript: '',
              extracted: {
                'contactName': '',
                'summary': '',
                'actions': [
                  {
                    'kind': 'follow_up',
                    'title': existing ? 'Send the report' : '',
                    'dueAt': null,
                    'timeSpecified': false,
                  },
                ],
              },
              contacts: const [],
              onSaved: () async {},
            ),
          ),
        );
        await tester.enterText(
          find.byKey(const ValueKey('manual-title')),
          'Send the report',
        );
        await tester.tap(find.byKey(const ValueKey('save-note')));
        await tester.pumpAndSettle();
        expect(api.requests, isEmpty);
        final time = find.text('Set reminder time');
        await tester.ensureVisible(time);
        await tester.pumpAndSettle();
        await tester.tap(time);
        await tester.pumpAndSettle();
        await tester.tap(find.text('OK'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('OK'));
        await tester.pumpAndSettle();
        await tester.tap(find.byKey(const ValueKey('save-note')));
        await tester.pumpAndSettle();
        expect(api.requests.length, 1);
        expect(api.requests.single.$1, existing ? 'action' : 'save');
        final body = api.requests.single.$2;
        final action = existing
            ? body
            : (body['actions'] as List).single as Map;
        expect(action['timeSpecified'], isTrue);
        expect(DateTime.parse(action['dueAt']).isAfter(DateTime.now()), isTrue);
        if (existing) {
          expect(body['id'], 'old');
        } else {
          expect(body['contactName'], '');
          expect(body['transcript'], 'Send the report');
        }
      },
    );
  }
}
