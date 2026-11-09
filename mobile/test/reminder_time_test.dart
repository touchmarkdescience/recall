import 'package:flutter_test/flutter_test.dart';
import 'package:recall_mobile/reminder_time.dart';
import 'package:recall_mobile/local_reminders.dart';
import 'package:recall_mobile/recall_api.dart';

void main() {
  final now = DateTime.utc(2026, 11, 9, 4);
  test('The reported phrases produce precise future times', () {
    for (final phrase in [
      'In another 3 minutes I need a reminder to check the code for mobile',
      'remind me for checking code in another 15 minutes',
      'Remind me in three minutes',
      'Follow up after fifteen minutes',
      'Meeting in 2 hours',
    ]) {
      expect(relativeReminderTime(phrase, now), isNotNull, reason: phrase);
    }
    expect(
      relativeReminderTime('In another 3 minutes I need a reminder', now),
      now.add(const Duration(minutes: 3)),
    );
    final resolved = resolveRelativeReminder(
      {
        'actions': [
          {'kind': 'reminder', 'title': 'Check code', 'timeSpecified': false},
        ],
      },
      'remind me in another 15 minutes',
      now,
    );
    expect((resolved['actions'] as List).single['timeSpecified'], isTrue);
    expect(
      DateTime.parse((resolved['actions'] as List).single['dueAt']),
      now.add(const Duration(minutes: 15)),
    );
  });
  test('Ambiguous offsets and before phrases are not guessed', () {
    for (final phrase in [
      'Remind me in 3 minutes or in 15 minutes',
      'Meeting tomorrow at 4 PM, remind me in 3 minutes',
      'Remind me 15 minutes before my meeting in 2 hours',
    ]) {
      expect(relativeReminderTime(phrase, now), isNull, reason: phrase);
    }
  });
  test('An untimed tomorrow call keeps the explicit tonight 6 PM alert', () {
    const note =
        'today I met Anand from SS TPL he wanted me to call him tomorrow with the proposal document so remind me tonight 6:00 p.m.';
    final result = resolveReminderTiming(
      {
        'contactName': 'Anand',
        'actions': [
          {
            'kind': 'follow_up',
            'title': 'Call Anand with proposal document',
            'dueAt': '2026-11-10T03:30:00Z',
            'timeSpecified': true,
          },
        ],
      },
      note,
      DateTime.utc(2026, 11, 9, 7, 30),
    );
    final action = (result['actions'] as List).single;
    expect(action['kind'], 'reminder');
    expect(DateTime.parse(action['dueAt']), DateTime.utc(2026, 11, 9, 12, 30));
    expect(action['title'], note);
    expect(action['reminderMinutes'], 0);
    for (final ambiguous in [
      'Call Anand tomorrow. Remind me tonight at 6 PM or 7 PM.',
      'Meeting tomorrow at 4 PM. Remind me tonight at 6 PM.',
    ]) {
      final original = {
        'actions': [
          {
            'kind': 'meeting',
            'dueAt': null,
            'timeChoices': ['a', 'b'],
          },
        ],
      };
      expect(resolveReminderTiming(original, ambiguous, now), original);
    }
  });
  test(
    'All three action kinds schedule; a missed lead time falls back to due',
    () {
      final actions = [
        for (final kind in ['reminder', 'meeting', 'follow_up'])
          RecallAction({
            'id': kind,
            'kind': kind,
            'status': 'pending',
            'title': 'Task',
            'dueAt': now.add(const Duration(minutes: 3)).toIso8601String(),
            'timeSpecified': true,
            'reminderMinutes': 60,
          }),
      ];
      final plans = planReminders(actions, now);
      expect(plans.length, 3);
      expect(
        plans.every(
          (p) =>
              p.at == now.add(const Duration(minutes: 3)) && p.leadTimePassed,
        ),
        isTrue,
      );
      expect(
        planReminders([
          RecallAction({
            'status': 'pending',
            'dueAt': now.add(const Duration(minutes: 3)).toIso8601String(),
            'timeSpecified': false,
          }),
        ], now),
        isEmpty,
      );
      actions.first.status = 'done';
      expect(planReminders(actions, now).length, 2);
    },
  );
}
