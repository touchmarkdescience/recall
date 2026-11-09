// Strict, deterministic support for short relative reminders. Never choose
// between multiple delays, a before/ago offset, or a conflicting calendar time.
DateTime? relativeReminderTime(String text, DateTime reference) {
  if (RegExp(
    r'\b(?:before|ago|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\b\d{1,2}:\d{2}\b|\b\d{1,2}\s*[ap]\.?m',
    caseSensitive: false,
  ).hasMatch(text)) {
    return null;
  }
  const words = {
    'one': 1,
    'two': 2,
    'three': 3,
    'four': 4,
    'five': 5,
    'six': 6,
    'seven': 7,
    'eight': 8,
    'nine': 9,
    'ten': 10,
    'fifteen': 15,
    'twenty': 20,
    'thirty': 30,
    'forty': 40,
    'forty-five': 45,
    'sixty': 60,
  };
  final pattern = RegExp(
    r'\b(?:in\s+(?:another\s+)?|after\s+|another\s+)(\d+|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|thirty|forty-five|forty|sixty)\s*(minutes?|mins?|hours?|hrs?)\b',
    caseSensitive: false,
  );
  final matches = pattern.allMatches(text).toList();
  if (matches.length != 1) return null;
  final match = matches.single;
  final count = int.tryParse(match[1]!) ?? words[match[1]!.toLowerCase()];
  if (count == null || count <= 0 || count > 1440) return null;
  final minutes = match[2]!.toLowerCase().startsWith('h') ? count * 60 : count;
  return reference.toUtc().add(Duration(minutes: minutes));
}

Map<String, dynamic> resolveRelativeReminder(
  Map<String, dynamic> extraction,
  String transcript,
  DateTime reference,
) {
  final actions = extraction['actions'] as List? ?? [];
  if (actions.length != 1) return extraction;
  final action = Map<String, dynamic>.from(actions.single as Map);
  if ((action['timeChoices'] as List? ?? []).length > 1) return extraction;
  final due = relativeReminderTime(transcript, reference);
  if (due == null) return extraction;
  return {
    ...extraction,
    'actions': [
      {...action, 'dueAt': due.toIso8601String(), 'timeSpecified': true},
    ],
  };
}

// Client guard for old deployed extractors: an explicitly dated alert controls
// its reminder, not an invented default clock time for an untimed future call.
Map<String, dynamic> resolveReminderTiming(
  Map<String, dynamic> extraction,
  String transcript,
  DateTime reference,
) {
  final relative = resolveRelativeReminder(extraction, transcript, reference);
  final actions = relative['actions'] as List? ?? [];
  if (actions.length != 1) return relative;
  final clean = transcript.trim();
  final marker = RegExp(
    r'\bremind me\b',
    caseSensitive: false,
  ).firstMatch(clean);
  if (marker == null || marker.start == 0) return relative;
  final event = clean.substring(0, marker.start),
      instruction = clean.substring(marker.end);
  final clock = RegExp(
    r'\b(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?',
    caseSensitive: false,
  );
  if (clock.hasMatch(event) ||
      RegExp(
        r'\b(?:before|or|versus|instead)\b',
        caseSensitive: false,
      ).hasMatch(instruction)) {
    return relative;
  }
  final clocks = clock.allMatches(instruction).toList();
  if (clocks.length != 1) return relative;
  final day = RegExp(
    r'\b(day after tomorrow|tomorrow|today|tonight)\b',
    caseSensitive: false,
  ).firstMatch(instruction);
  if (day == null) return relative;
  final match = clocks.single;
  final hour = int.parse(match[1]!), minute = int.parse(match[2] ?? '0');
  if (hour < 1 || hour > 12 || minute > 59) return relative;
  final ist = reference.toUtc().add(const Duration(hours: 5, minutes: 30));
  final days = switch (day[1]!.toLowerCase()) {
    'tomorrow' => 1,
    'day after tomorrow' => 2,
    _ => 0,
  };
  final at = DateTime.utc(
    ist.year,
    ist.month,
    ist.day + days,
    hour % 12 + (match[3]!.toLowerCase() == 'p' ? 12 : 0),
    minute,
  ).subtract(const Duration(hours: 5, minutes: 30));
  final action = Map<String, dynamic>.from(actions.single as Map);
  return {
    ...relative,
    'actions': [
      {
        ...action,
        'kind': 'reminder',
        'title': clean.length <= 500 ? clean : clean.substring(0, 500),
        'dueAt': at.toIso8601String(),
        'timeSpecified': true,
        'reminderMinutes': 0,
        'timeChoices': <String>[],
      },
    ],
  };
}
