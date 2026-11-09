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

// An explicit alert has its own date, independent of a meeting date.
// Separate preparation reminders use the existing action model and scheduler.
DateTime? spokenDatedClock(String text, DateTime reference) {
  final clocks = RegExp(
    r'\b(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?',
    caseSensitive: false,
  ).allMatches(text).toList();
  if (clocks.length != 1) return null;
  final clock = clocks.single;
  final days = RegExp(
    r'\b(day after tomorrow|tomorrow|today|tonight)\b',
    caseSensitive: false,
  ).allMatches(text).toList();
  if (days.isEmpty) return null;
  final before = days.where((d) => d.start < clock.start).toList();
  final day = before.isNotEmpty ? before.last : days.first;
  final hour = int.parse(clock[1]!), minute = int.parse(clock[2] ?? '0');
  if (hour < 1 || hour > 12 || minute > 59) return null;
  final ist = reference.toUtc().add(const Duration(hours: 5, minutes: 30));
  final offset = switch (day[1]!.toLowerCase()) {
    'tomorrow' => 1,
    'day after tomorrow' => 2,
    _ => 0,
  };
  return DateTime.utc(
    ist.year,
    ist.month,
    ist.day + offset,
    hour % 12 + (clock[3]!.toLowerCase() == 'p' ? 12 : 0),
    minute,
  ).subtract(const Duration(hours: 5, minutes: 30));
}

Map<String, dynamic> _resolveExplicitReminderTiming(
  Map<String, dynamic> extraction,
  String transcript,
  DateTime reference,
) {
  var relative = resolveRelativeReminder(extraction, transcript, reference);
  if ((relative['contactName'] ?? '').toString().trim().isEmpty) {
    final name = RegExp(
      r"\b(?:met(?: with)?|discussion with|spoke (?:to|with))\s+((?:(?:Mr|Mrs|Ms|Dr)\.?\s+)?[a-zA-Z'-]+)(?=\s+(?:sir|from|regarding|about|he|she)\b|[.,])",
      caseSensitive: false,
    ).firstMatch(transcript)?[1];
    if (name != null) relative = {...relative, 'contactName': name};
  }
  final clean = transcript.trim();
  if (RegExp(
    r'\b(?:versus|instead)\b|\bor\s+\d',
    caseSensitive: false,
  ).hasMatch(clean)) {
    return relative;
  }
  final marker = RegExp(
    r'\b(?:remind me|(?:set|need|add|give)(?:\s+me)?\s+(?:a\s+)?reminder(?:\s+for)?)\b',
    caseSensitive: false,
  ).firstMatch(clean);
  Map<String, dynamic> action(String kind, String title, DateTime at) => {
    'kind': kind,
    'title': title.length > 500 ? title.substring(0, 500) : title,
    'dueAt': at.toIso8601String(),
    'timeSpecified': true,
    'reminderMinutes': 0,
    'timeChoices': <String>[],
  };
  if (marker != null) {
    final event = clean.substring(0, marker.start).trim();
    final instruction = clean.substring(marker.end).trim();
    if (RegExp(
      r'\b(?:before|or)\b',
      caseSensitive: false,
    ).hasMatch(instruction)) {
      return relative;
    }
    final alert = spokenDatedClock(instruction, reference);
    if (alert == null) return relative;
    final eventAt = spokenDatedClock(event, reference);
    if (eventAt != null) {
      final kind =
          RegExp(
            r'\b(?:meeting|meet|discuss|discussion)\b',
            caseSensitive: false,
          ).hasMatch(event)
          ? 'meeting'
          : 'follow_up';
      return {
        ...relative,
        'actions': [
          action(kind, event, eventAt),
          action('reminder', 'Remind me $instruction', alert),
        ],
      };
    }
    // No precise event clock: do not invent a 9 AM appointment or steal its day.
    if (!RegExp(
      r'\b\d{1,2}(?::\d{2})?\s*[ap]\.?m',
      caseSensitive: false,
    ).hasMatch(event)) {
      final hasFutureEvent =
          RegExp(
            r'\b(?:tomorrow|day after tomorrow)\b',
            caseSensitive: false,
          ).hasMatch(event) &&
          RegExp(
            r'\b(?:call|meeting|meet|discuss)\b',
            caseSensitive: false,
          ).hasMatch(event);
      final kind =
          RegExp(
            r'\b(?:meeting|meet|discuss)\b',
            caseSensitive: false,
          ).hasMatch(event)
          ? 'meeting'
          : 'follow_up';
      return {
        ...relative,
        'actions': [
          if (hasFutureEvent)
            {
              'kind': kind,
              'title': event.length > 500 ? event.substring(0, 500) : event,
              'dueAt': null,
              'timeSpecified': false,
              'reminderMinutes': 0,
              'timeChoices': <String>[],
            },
          action('reminder', clean, alert),
        ],
      };
    }
  }
  // Explicit preparation today and a separately timed meeting tomorrow.
  final meeting = RegExp(
    r'\b(?:our meeting|the meeting|meeting is scheduled|we (?:are|have) (?:a )?meeting)\b',
    caseSensitive: false,
  ).firstMatch(clean);
  if (marker == null && meeting != null && meeting.start > 0) {
    final prep = clean.substring(0, meeting.start).trim(),
        event = clean.substring(meeting.start).trim();
    final prepAt = spokenDatedClock(prep, reference),
        eventAt = spokenDatedClock(event, reference);
    if (prepAt != null &&
        eventAt != null &&
        RegExp(
          r'\b(?:prepare|send|share|document|PPT|presentation)\b',
          caseSensitive: false,
        ).hasMatch(prep)) {
      return {
        ...relative,
        'actions': [
          action('reminder', prep, prepAt),
          action('meeting', event, eventAt),
        ],
      };
    }
  }
  return relative;
}

// For "today at 2:45", use the next remaining occurrence today. Explicit AM/PM
// and other calendar days are left untouched; no rollover to tomorrow.
DateTime? futureClockToday(String text, DateTime reference) {
  if (!RegExp(r'\btoday\b', caseSensitive: false).hasMatch(text) ||
      RegExp(
        r'\b(?:tomorrow|tonight|morning|afternoon|evening|night|or|versus|instead)\b|\d\s*[ap]\.?m',
        caseSensitive: false,
      ).hasMatch(text)) {
    return null;
  }
  final regular = RegExp(
    r'\b(?:at|by|around)\s+(\d{1,2})(?::(\d{2}))?\b|\b(\d{1,2})[:.](\d{2})\b',
    caseSensitive: false,
  ).allMatches(text).toList();
  int hour, minute;
  if (regular.length == 1) {
    final m = regular.single;
    hour = int.parse(m[1] ?? m[3]!);
    minute = int.parse(m[2] ?? m[4] ?? '0');
  } else if (regular.isEmpty) {
    final compact = RegExp(
      r'\b(?:at|by|today)\s+(\d{1,2})(\d{2})\b',
      caseSensitive: false,
    ).allMatches(text).toList();
    if (compact.length != 1) return null;
    hour = int.parse(compact.single[1]!);
    minute = int.parse(compact.single[2]!);
  } else {
    return null;
  }
  if (hour > 23 || minute > 59) return null;
  final ist = reference.toUtc().add(const Duration(hours: 5, minutes: 30));
  final hours = hour > 12 || hour == 0 ? [hour] : [hour % 12, hour % 12 + 12];
  for (final h in hours) {
    final at = DateTime.utc(
      ist.year,
      ist.month,
      ist.day,
      h,
      minute,
    ).subtract(const Duration(hours: 5, minutes: 30));
    if (at.isAfter(reference)) return at;
  }
  return null;
}

List<Map<String, dynamic>> expandReminderActions(List<dynamic> actions) {
  final result = <Map<String, dynamic>>[];
  for (final item in actions) {
    final a = Map<String, dynamic>.from(item as Map);
    final lead = (a['reminderMinutes'] as num?)?.toInt() ?? 0;
    final due = DateTime.tryParse('${a['dueAt'] ?? ''}');
    if (![0, 10, 30, 60, 1440].contains(lead) &&
        lead > 0 &&
        lead <= 525600 &&
        due != null) {
      result.add({...a, 'reminderMinutes': 0});
      final title = 'Prepare: ${a['title'] ?? ''}';
      result.add({
        'kind': 'reminder',
        'title': title.length > 500 ? title.substring(0, 500) : title,
        'dueAt': due
            .subtract(Duration(minutes: lead))
            .toUtc()
            .toIso8601String(),
        'timeSpecified': true,
        'reminderMinutes': 0,
      });
    } else {
      result.add(a);
    }
  }
  return result;
}

Map<String, dynamic> resolveReminderTiming(
  Map<String, dynamic> extraction,
  String transcript,
  DateTime reference,
) {
  var input = {...extraction};
  final original = input['actions'] as List? ?? [];
  final today = futureClockToday(transcript, reference);
  if (original.length == 1 && today != null) {
    input = {
      ...input,
      'timingNote':
          'Time without AM/PM was interpreted as the next future time today. Please check it.',
      'actions': [
        {
          ...Map<String, dynamic>.from(original.single as Map),
          'dueAt': today.toIso8601String(),
          'timeSpecified': true,
          'timeChoices': <String>[],
        },
      ],
    };
  }
  final name = '${input['contactName'] ?? ''}';
  if (name.isEmpty || name.toLowerCase().startsWith('with ')) {
    final person = RegExp(
      r'\b(?:call|meeting|spoke)\s+(?:with|to)\s+(.+?)(?=\s+(?:at|by|today|tomorrow|about|regarding)\b|[.;]|$)',
      caseSensitive: false,
    ).firstMatch(transcript)?[1]?.trim();
    if (person != null && person.split(RegExp(r'\s+')).length <= 4) {
      input = {...input, 'contactName': person, 'matchedContactId': null};
    }
  }
  var result = _resolveExplicitReminderTiming(input, transcript, reference);
  final advances = RegExp(
    r'\b(\d+|fifteen)\s*(?:minutes?|mins?)\s+before\b',
    caseSensitive: false,
  ).allMatches(transcript).toList();
  final actions = result['actions'] as List? ?? [];
  if (actions.length == 1 &&
      advances.length == 1 &&
      !RegExp(
        r'\b(?:or|versus|instead)\b',
        caseSensitive: false,
      ).hasMatch(transcript)) {
    final lead = advances.single[1]!.toLowerCase() == 'fifteen'
        ? 15
        : int.parse(advances.single[1]!);
    if (lead > 0 && lead <= 525600) {
      result = {
        ...result,
        'actions': [
          {
            ...Map<String, dynamic>.from(actions.single as Map),
            'reminderMinutes': lead,
          },
        ],
      };
    }
  }
  return {
    ...result,
    'actions': expandReminderActions(result['actions'] as List? ?? []),
  };
}
