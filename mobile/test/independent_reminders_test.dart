import 'package:flutter_test/flutter_test.dart';
import 'package:recall_mobile/reminder_time.dart';
import 'package:recall_mobile/local_reminders.dart';
import 'package:recall_mobile/recall_api.dart';

void main() {
  final now = DateTime.utc(2026, 11, 9, 7, 30);
  final old = {
    'contactName': '',
    'actions': [
      {
        'kind': 'meeting',
        'title': 'Meeting',
        'dueAt': '2026-11-10T14:30:00Z',
        'timeSpecified': true,
      },
    ],
  };
  test('Set a reminder tonight 8 PM must not become tomorrow 8 PM', () {
    final r = resolveReminderTiming(
      old,
      'Today I met Anand sir regarding his cricket match he wants a meeting tomorrow afternoon for lunch you set a reminder for tonight 8:00 p.m. to check and confirm my availability',
      now,
    );
    final a = (r['actions'] as List).last;
    expect((r['actions'] as List).first['dueAt'], isNull);
    expect(r['contactName'], 'Anand');
    expect(a['kind'], 'reminder');
    expect(DateTime.parse(a['dueAt']), DateTime.utc(2026, 11, 9, 14, 30));
  });
  test(
    'Preparation this evening and tomorrow meeting keep independent exact times',
    () {
      final r = resolveReminderTiming(
        old,
        'Today I had discussion with arayapan regarding the product demo prepare the PPT today evening 5:00 p.m. our meeting is scheduled tomorrow morning 9:00 a.m.',
        now,
      );
      final actions = (r['actions'] as List)
          .map((a) => RecallAction(Map<String, dynamic>.from(a)))
          .toList();
      expect(actions.length, 2);
      expect(actions[0].kind, 'reminder');
      expect(actions[0].dueAt, DateTime.utc(2026, 11, 9, 11, 30));
      expect(actions[1].kind, 'meeting');
      expect(actions[1].dueAt, DateTime.utc(2026, 11, 10, 3, 30));
      expect(planReminders(actions, now).map((p) => p.at), [
        DateTime.utc(2026, 11, 9, 11, 30),
        DateTime.utc(2026, 11, 10, 3, 30),
      ]);
    },
  );
  test(
    'Meeting tomorrow and arbitrary preparation time tonight produce two actions',
    () {
      final r = resolveReminderTiming(
        old,
        'Meeting tomorrow at 4 PM. Set a reminder tonight at 7:23 PM to prepare the documents.',
        now,
      );
      final a = r['actions'] as List;
      expect(a.length, 2);
      expect(DateTime.parse(a[0]['dueAt']), DateTime.utc(2026, 11, 10, 10, 30));
      expect(DateTime.parse(a[1]['dueAt']), DateTime.utc(2026, 11, 9, 13, 53));
    },
  );
  test('Conflicting reminder times are not silently selected', () {
    const note =
        'Meeting tomorrow at 4 PM. Set a reminder tonight at 6 PM or 7 PM.';
    expect(resolveReminderTiming(old, note, now), old);
  });
}
