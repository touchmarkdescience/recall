import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recall_mobile/main.dart';
import 'package:recall_mobile/recall_api.dart';
import 'package:recall_mobile/recall_ui.dart';
import 'package:timezone/data/latest.dart' as tz_data;
import 'speech_capture_test.dart' show FakeSpeech;

class CaptureApi extends RecallApi {
  final notes = <String>[];
  CaptureApi() : super(null);
  @override
  Future<Map<String, dynamic>> post(
    String route,
    Map<String, dynamic> body,
  ) async {
    if (route == 'extract') notes.add(body['transcript']);
    return {
      'contactName': 'Anand',
      'summary': body['transcript'],
      'actions': [
        {
          'kind': 'follow_up',
          'title': 'Call Anand',
          'dueAt': DateTime.now()
              .add(const Duration(days: 1))
              .toIso8601String(),
          'timeSpecified': true,
        },
      ],
    };
  }
}

void main() {
  setUpAll(tz_data.initializeTimeZones);
  testWidgets(
    'Stop and review sends the last final words, not an earlier partial',
    (tester) async {
      final engine = FakeSpeech(), api = CaptureApi();
      await tester.pumpWidget(
        MaterialApp(
          home: CapturePage(
            api: api,
            contacts: const [],
            onSaved: () async {},
            speechInput: engine,
          ),
        ),
      );
      await tester.tap(find.byType(RecallVoiceOrb));
      await tester.pump();
      await tester.pump();
      engine.words('Call Anand tomorrow with the proposal document');
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('review-details')));
      await tester.pump();
      expect(api.notes, isEmpty);
      engine.words(
        'Call Anand tomorrow with the proposal document so remind me tonight at 6 PM',
        finalResult: true,
      );
      engine.status('done');
      await tester.pumpAndSettle();
      expect(api.notes.single, endsWith('so remind me tonight at 6 PM'));
      expect(find.text('Review note'), findsOneWidget);
      await tester.pumpWidget(const SizedBox());
      await tester.pump();
    },
  );
  testWidgets(
    'A transient permission dialog does not cancel capture; backgrounding does',
    (tester) async {
      final engine = FakeSpeech(), api = CaptureApi();
      await tester.pumpWidget(
        MaterialApp(
          home: CapturePage(
            api: api,
            contacts: const [],
            onSaved: () async {},
            speechInput: engine,
          ),
        ),
      );
      await tester.tap(find.byType(RecallVoiceOrb));
      await tester.pump();
      await tester.pump();
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      expect(engine.stops, 0);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
      expect(engine.stops, 1);
      engine.status('done');
      await tester.pump();
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pumpWidget(const SizedBox());
      await tester.pump();
    },
  );
  testWidgets(
    'Typing is still a working path without starting the microphone',
    (tester) async {
      final engine = FakeSpeech(), api = CaptureApi();
      await tester.pumpWidget(
        MaterialApp(
          home: CapturePage(
            api: api,
            contacts: const [],
            onSaved: () async {},
            speechInput: engine,
          ),
        ),
      );
      await tester.enterText(
        find.byType(TextField),
        'Remind me to call Anand tomorrow at 6 PM',
      );
      await tester.tap(find.byKey(const ValueKey('review-details')));
      await tester.pumpAndSettle();
      expect(api.notes.single, 'Remind me to call Anand tomorrow at 6 PM');
      expect(engine.listens, 0);
      await tester.pumpWidget(const SizedBox());
      await tester.pump();
    },
  );
}
