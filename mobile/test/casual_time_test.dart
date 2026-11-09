import 'package:flutter_test/flutter_test.dart';
import 'package:recall_mobile/reminder_time.dart';

void main() {
  final now = DateTime.utc(2026, 11, 9, 7, 30); // 1 PM IST
  const note =
      'remind me to prepare for call with CMS Placement Officer at 2:45 today';
  final old = {
    'contactName': 'with CMS Placement',
    'actions': [
      {
        'kind': 'reminder',
        'title': note,
        'dueAt': '2026-11-08T21:15:00Z',
        'timeSpecified': true,
      },
    ],
  };
  test(
    'Today 2:45 without a period chooses the remaining PM slot and correct person',
    () {
      final r = resolveReminderTiming(old, note, now);
      expect(r['contactName'], 'CMS Placement Officer');
      expect(
        DateTime.parse((r['actions'] as List).single['dueAt']),
        DateTime.utc(2026, 11, 9, 9, 15),
      );
      expect(r['timingNote'], isNotNull);
      expect((r['actions'] as List).single['reminderMinutes'], isNot(15));
    },
  );
  test(
    'Compact 245 and explicit 24-hour clocks work; explicit AM is never flipped',
    () {
      expect(
        futureClockToday('call today 245', now),
        DateTime.utc(2026, 11, 9, 9, 15),
      );
      expect(
        futureClockToday('call at 14:45 today', now),
        DateTime.utc(2026, 11, 9, 9, 15),
      );
      expect(futureClockToday('call at 2:45 AM today', now), isNull);
      expect(futureClockToday('call at 2:45 tomorrow', now), isNull);
      expect(futureClockToday('call at 2:45 or 3:00 today', now), isNull);
      expect(
        futureClockToday('call at 2:45 today', DateTime.utc(2026, 11, 9, 15)),
        isNull,
      );
    },
  );
  test(
    'A spoken fifteen-minute advance becomes a separately savable alert',
    () {
      final r = resolveReminderTiming(
        old,
        '$note. Remind me fifteen minutes before.',
        now,
      );
      final a = r['actions'] as List;
      expect(a.length, 2);
      expect(a.every((x) => x['reminderMinutes'] == 0), isTrue);
      expect(DateTime.parse(a[1]['dueAt']), DateTime.utc(2026, 11, 9, 9));
    },
  );
  test('Legacy extractor fifteen-minute offsets are expanded idempotently', () {
    final a = expandReminderActions([
      {
        'kind': 'meeting',
        'title': 'Call CMS',
        'dueAt': '2026-11-09T09:15:00Z',
        'reminderMinutes': 15,
        'timeSpecified': true,
      },
    ]);
    expect(a.length, 2);
    expect(DateTime.parse(a[1]['dueAt']), DateTime.utc(2026, 11, 9, 9));
    expect(expandReminderActions(a), a);
  });
}
