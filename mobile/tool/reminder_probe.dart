// Emulator-only entry point: exercises the production reminder scheduler.
// No API calls, accounts or production records are created.
import 'package:flutter/material.dart';
import 'package:recall_mobile/local_reminders.dart';
import 'package:recall_mobile/recall_api.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final reminders = LocalReminders();
  await reminders.initialize();
  const scenario = String.fromEnvironment('PROBE_CASE', defaultValue: 'online');
  final due = DateTime.now().toUtc().add(const Duration(seconds: 55));
  await reminders.sync('emulator-only-probe', [
    for (final kind in ['reminder', 'meeting', 'follow_up'])
      RecallAction({
        'id': 'probe-$scenario-$kind',
        'title': 'Recall probe $scenario $kind',
        'kind': kind,
        'status': 'pending',
        'dueAt': due.toIso8601String(),
        'timeSpecified': true,
        'reminderMinutes': 0,
      }),
  ]);
  debugPrint(
    'RECALL_PROBE case=$scenario scheduled=${reminders.scheduledCount} enabled=${reminders.enabled} exact=${reminders.exact} due=${due.toIso8601String()} error=${reminders.error}',
  );
  runApp(
    MaterialApp(
      home: Scaffold(
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text(
              'Recall device test\n$scenario\nScheduled ${reminders.scheduledCount}\nDue ${due.toIso8601String()}\n${reminders.error ?? ''}',
              style: const TextStyle(fontSize: 22),
            ),
          ),
        ),
      ),
    ),
  );
}
