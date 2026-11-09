import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recall_mobile/local_reminders.dart';
import 'package:recall_mobile/recall_api.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('dexterous.com/flutter/local_notifications');
  late Map<int, Map<String, dynamic>> pending;
  bool fail = false;
  setUp(() {
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    AndroidFlutterLocalNotificationsPlugin.registerWith();
    pending = {
      987: {'id': 987, 'title': 'Stale reminder', 'body': '', 'payload': 'old'},
    };
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
          switch (call.method) {
            case 'initialize':
              return true;
            case 'areNotificationsEnabled':
              return true;
            case 'canScheduleExactNotifications':
              return true;
            case 'getNotificationChannels':
              return <Map<String, dynamic>>[];
            case 'pendingNotificationRequests':
              return pending.values.toList();
            case 'zonedSchedule':
              if (fail) {
                throw PlatformException(code: 'exact_alarms_not_permitted');
              }
              final args = Map<String, dynamic>.from(call.arguments as Map);
              final id = args['id'] as int;
              pending[id] = {
                'id': id,
                'title': args['title'],
                'body': args['body'],
                'payload': args['payload'],
              };
              return null;
            case 'cancel':
              pending.remove((call.arguments as Map)['id']);
              return null;
            case 'cancelAll':
              pending.clear();
              return null;
          }
          return null;
        });
    fail = false;
  });
  tearDown(() {
    debugDefaultTargetPlatformOverride = null;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });
  List<RecallAction> actions() => [
    for (final kind in ['reminder', 'meeting', 'follow_up'])
      RecallAction({
        'id': kind,
        'kind': kind,
        'title': 'Task $kind',
        'status': 'pending',
        'dueAt': DateTime.now()
            .add(const Duration(minutes: 3))
            .toUtc()
            .toIso8601String(),
        'timeSpecified': true,
      }),
  ];
  test(
    'OS pending queue is reconciled across restart, completion and logout',
    () async {
      final scheduler = LocalReminders();
      await scheduler.initialize();
      await scheduler.sync('account', actions());
      expect(scheduler.scheduledCount, 3);
      expect(pending.containsKey(987), isFalse);
      expect(pending.values.map((entry) => entry['title']).toSet(), {
        'Recall reminder',
        'Meeting reminder',
        'Follow-up reminder',
      });
      final restarted = LocalReminders();
      await restarted.initialize();
      final done = actions();
      for (final action in done) {
        action.status = 'done';
      }
      await restarted.sync('account', done);
      expect(pending, isEmpty);
      await restarted.sync('account', actions());
      await restarted.clear();
      expect(pending, isEmpty);
    },
  );
  test('Scheduling errors are visible rather than silently ignored', () async {
    final scheduler = LocalReminders();
    await scheduler.initialize();
    fail = true;
    await scheduler.sync('account', actions());
    expect(scheduler.scheduledCount, 0);
    expect(scheduler.error, contains('3 reminders could not be scheduled'));
    expect(pending, isEmpty);
  });
}
