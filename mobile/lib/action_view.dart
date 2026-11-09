import 'package:timezone/timezone.dart' as tz;
import 'recall_api.dart';

String compactCount(int count) => count >= 1000
    ? '1k+'
    : count > 99
    ? '99+'
    : '$count';

enum ActionFilter {
  open('Open'),
  today('Today'),
  overdue('Overdue'),
  upcoming('Upcoming'),
  done('Done'),
  archived('Archived');

  final String label;
  const ActionFilter(this.label);

  bool matches(RecallAction action, DateTime now) {
    if (this == done) return action.status == 'done';
    if (this == archived) return action.status == 'archived';
    if (action.status != 'pending') return false;
    if (this == open) return true;
    if (action.dueAt == null) return false;
    final ist = tz.getLocation('Asia/Kolkata');
    final current = tz.TZDateTime.from(now, ist);
    final due = tz.TZDateTime.from(action.dueAt!, ist);
    final start = tz.TZDateTime(ist, current.year, current.month, current.day);
    final next = tz.TZDateTime(
      ist,
      current.year,
      current.month,
      current.day + 1,
    );
    return switch (this) {
      today => !due.isBefore(start) && due.isBefore(next),
      overdue =>
        due.isBefore(start) || (action.timeSpecified && due.isBefore(current)),
      upcoming => !due.isBefore(next),
      _ => false,
    };
  }
}

// Each native listen session may emit the same final result more than once.
// Always replace its segment against the text captured before that session.
class SpeechSegment {
  final String prefix;
  const SpeechSegment(this.prefix);
  String render(String words) =>
      [prefix.trim(), words.trim()].where((s) => s.isNotEmpty).join(' ');
}

// Display-only repair for legacy recognizer output repeating the complete note.
// Original stored words remain unchanged and editable.
String actionDisplayText(String text) {
  final words = text.trim().split(RegExp(r'\s+'));
  String normalize(String word) =>
      word.toLowerCase().replaceAll(RegExp(r"[^a-z0-9]"), '');
  while (words.length >= 12 && words.length.isEven) {
    final half = words.length ~/ 2;
    var same = true;
    for (var i = 0; i < half; i++) {
      if (normalize(words[i]) != normalize(words[i + half])) {
        same = false;
        break;
      }
    }
    if (!same) break;
    words.removeRange(half, words.length);
  }
  return words.join(' ');
}
