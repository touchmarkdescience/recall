import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recall_mobile/main.dart';
import 'package:recall_mobile/action_view.dart';
import 'package:recall_mobile/recall_api.dart';
import 'package:timezone/data/latest.dart' as tz_data;

void main() {
  setUpAll(tz_data.initializeTimeZones);
  testWidgets('Recall onboarding introduces the voice flow', (tester) async {
    await tester.pumpWidget(MaterialApp(home: OnboardingPage(onDone: () {})));
    expect(find.text('Recall'), findsOneWidget);
    expect(find.text('Speak it before you forget.'), findsOneWidget);
    expect(find.byIcon(Icons.mic_none), findsOneWidget);
  });

  test('Repeated partial and final speech results replace one segment', () {
    const segment = SpeechSegment('Earlier note.');
    expect(segment.render('Call Arjun'), 'Earlier note. Call Arjun');
    expect(
      segment.render('Call Arjun tomorrow'),
      'Earlier note. Call Arjun tomorrow',
    );
    expect(
      segment.render('Call Arjun tomorrow'),
      'Earlier note. Call Arjun tomorrow',
    );
    final next = SpeechSegment(segment.render('Call Arjun tomorrow'));
    expect(
      next.render('Send the PPT'),
      'Earlier note. Call Arjun tomorrow Send the PPT',
    );
  });

  test('Count badges and IST date filters handle boundaries', () {
    expect([0, 99, 100, 999, 1000, 2000].map(compactCount).toList(), [
      '0',
      '99',
      '99+',
      '99+',
      '1k+',
      '1k+',
    ]);
    final now = DateTime.parse('2026-11-08T19:00:00Z'); // Nov 9 in IST.
    final action = RecallAction({
      'id': 'a',
      'status': 'pending',
      'dueAt': '2026-11-09T12:30:00Z',
    });
    expect(ActionFilter.today.matches(action, now), isTrue);
    expect(ActionFilter.upcoming.matches(action, now), isFalse);
    expect(ActionFilter.overdue.matches(action, now), isFalse);
  });

  testWidgets('All introduction slides can advance without layout overflow', (
    tester,
  ) async {
    bool finished = false;
    await tester.pumpWidget(
      MaterialApp(home: OnboardingPage(onDone: () => finished = true)),
    );
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();
    expect(find.text('Know what comes next.'), findsOneWidget);
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();
    expect(find.text('Remember every promise.'), findsOneWidget);
    await tester.tap(find.text('Get started'));
    expect(finished, isTrue);
  });

  testWidgets('Actions summaries include upcoming, count and filter cards', (
    tester,
  ) async {
    final actions = [
      RecallAction({
        'id': 'future',
        'title': 'Future meeting',
        'status': 'pending',
        'dueAt': DateTime.now().add(const Duration(days: 3)).toIso8601String(),
      }),
      RecallAction({'id': 'done', 'title': 'Finished work', 'status': 'done'}),
    ];
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ActionsPage(
            actions: actions,
            onUpdate: (_, _) async {},
            onRefresh: () async {},
          ),
        ),
      ),
    );
    expect(find.text('Upcoming'), findsOneWidget);
    await tester.tap(find.text('Done'));
    await tester.pump();
    expect(find.text('Finished work'), findsOneWidget);
    expect(find.text('Future meeting'), findsNothing);
    await tester.tap(find.text('Upcoming'));
    await tester.pump();
    expect(find.text('Future meeting'), findsOneWidget);
  });

  for (final keyboard in [false, true]) {
    testWidgets('Review remains visible on a short phone, keyboard=$keyboard', (
      tester,
    ) async {
      tester.view.physicalSize = const Size(390, 700);
      tester.view.devicePixelRatio = 1;
      if (keyboard) tester.view.viewInsets = const FakeViewPadding(bottom: 280);
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
        tester.view.resetViewInsets();
      });
      await tester.pumpWidget(
        MaterialApp(
          home: CapturePage(
            api: RecallApi(null),
            contacts: const [],
            onSaved: () async {},
          ),
        ),
      );
      await tester.pumpAndSettle();
      final button = find.byKey(const ValueKey('review-details'));
      expect(button.hitTestable(), findsOneWidget);
      expect(
        tester.getRect(button).bottom,
        lessThanOrEqualTo(keyboard ? 420 : 700),
      );
      await tester.tap(button);
      await tester.pump();
      expect(find.text('Say or type a short note first.'), findsOneWidget);
    });
  }

  testWidgets('Review keeps person optional and asks about conflicting times', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: ReviewPage(
          api: RecallApi(null),
          transcript: 'Meet Arjun tomorrow at 1 or 4 PM',
          extracted: {
            'contactName': 'Arjun',
            'summary': 'Discuss the demo',
            'actions': [
              {
                'kind': 'meeting',
                'title': 'Discuss the demo',
                'dueAt': null,
                'timeSpecified': true,
                'timeChoices': ['2026-11-09T07:30:00Z', '2026-11-09T10:30:00Z'],
              },
            ],
          },
          contacts: const [],
          onSaved: () async {},
        ),
      ),
    );
    expect(find.text('Optional'), findsOneWidget);
    await tester.tap(find.text('Person'));
    await tester.pumpAndSettle();
    expect(find.text('New person’s name (optional)'), findsOneWidget);
    await tester.tap(find.text('Apply changes'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Two times were heard. Choose one:'));
    expect(find.text('Two times were heard. Choose one:'), findsOneWidget);
  });
}
