import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recall_mobile/local_reminders.dart';
import 'package:recall_mobile/notification_actions.dart';
import 'package:recall_mobile/recall_api.dart';

class NotificationApi extends RecallApi {
  bool offline;
  final calls = <String>[];
  NotificationApi({this.offline = false}) : super('test-token');
  @override
  Future<Map<String, dynamic>> get(String route) async {
    if (offline) throw RecallApiError('Offline', 0);
    return {
      'user': {'id': 'account'},
    };
  }

  @override
  Future<Map<String, dynamic>> post(
    String route,
    Map<String, dynamic> body,
  ) async {
    if (offline) throw RecallApiError('Offline', 0);
    calls.add('${body['id']}:${body['status']}');
    return {'ok': true};
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('dexterous.com/flutter/local_notifications');
  late Map<int, Map<String, dynamic>> pending;
  bool fail = false;
  setUp(() {
    FlutterSecureStorage.setMockInitialValues({'session': 'test-token'});
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
              pending[id] = args;
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

  NotificationResponse response(String action, String payload) =>
      NotificationResponse(
        notificationResponseType:
            NotificationResponseType.selectedNotificationAction,
        actionId: action,
        payload: payload,
      );

  test(
    'All real reminder types include both background buttons, without credentials',
    () async {
      final scheduler = LocalReminders();
      await scheduler.initialize();
      await scheduler.sync('account', actions());
      for (final entry in pending.values) {
        final android = entry['platformSpecifics'] as Map;
        expect((android['actions'] as List).map((a) => a['id']), [
          completeNotificationAction,
          snoozeNotificationAction,
        ]);
        expect(
          (android['actions'] as List).every(
            (a) => a['showsUserInterface'] == false,
          ),
          isTrue,
        );
        expect(entry['payload'], isNot(contains('test-token')));
        expect(ReminderPayload.parse(entry['payload'])?.account, 'account');
      }
    },
  );

  test(
    'Snooze schedules offline, survives restart and overdue due times, without moving the action',
    () async {
      final scheduler = LocalReminders();
      await scheduler.initialize();
      final original = actions();
      await scheduler.sync('account', original);
      final entry = pending.values.first;
      final payload = entry['payload'] as String;
      final id = ReminderPayload.parse(payload)!.id;
      final before = DateTime.now();
      await scheduler.handleNotificationResponse(
        response(snoozeNotificationAction, payload),
      );
      final state = await scheduler.actionStore.read('account', id);
      final snoozeAt = DateTime.parse(state['snoozeAt']);
      expect(snoozeAt.difference(before).inSeconds, inInclusiveRange(299, 301));
      final restarted = LocalReminders();
      await restarted.initialize();
      await restarted.sync('account', original);
      expect(
        (await restarted.actionStore.read('account', id))['snoozeAt'],
        state['snoozeAt'],
      );
      expect(pending.length, 3);
      expect(original.first.dueAt!.difference(before).inMinutes, lessThan(5));

      final overdue = RecallAction({
        'id': 'overdue',
        'dueAt': before.subtract(const Duration(minutes: 1)).toIso8601String(),
      });
      final overduePayload = ReminderPayload(
        'account',
        'overdue',
        'Call',
        'Call',
        'follow_up',
        dueAt: overdue.dueAt!.toUtc().toIso8601String(),
      ).encode();
      await restarted.handleNotificationResponse(
        response(snoozeNotificationAction, overduePayload),
      );
      await restarted.sync('account', [overdue]);
      expect(pending.length, 1);
      expect(
        ReminderPayload.parse(pending.values.single['payload'])?.id,
        'overdue',
      );
    },
  );

  test(
    'Offline completion remains durable, suppresses snooze, then syncs once',
    () async {
      final scheduler = LocalReminders();
      await scheduler.initialize();
      final original = actions();
      await scheduler.sync('account', original);
      final payload = pending.values.first['payload'] as String;
      final id = ReminderPayload.parse(payload)!.id;
      await scheduler.handleNotificationResponse(
        response(completeNotificationAction, payload),
        client: NotificationApi(offline: true),
      );
      expect((await scheduler.actionStore.read('account', id))['done'], true);
      await scheduler.handleNotificationResponse(
        response(snoozeNotificationAction, payload),
      );
      await scheduler.sync('account', original);
      expect(pending.length, 2);
      expect(scheduler.error, contains('Completion saved on this phone'));

      final restarted = LocalReminders();
      final offline = NotificationApi(offline: true);
      await restarted.reconcileNotificationActions(
        'account',
        original,
        offline,
        serverSnapshot: false,
      );
      await restarted.reconcileNotificationActions(
        'account',
        original,
        offline,
        serverSnapshot: false,
      );
      expect((await scheduler.actionStore.read('account', id))['done'], true);
      final api = NotificationApi();
      await restarted.reconcileNotificationActions('account', original, api);
      expect(api.calls, ['$id:done']);
      expect(original.firstWhere((a) => a.id == id).status, 'done');
      await restarted.reconcileNotificationActions('account', original, api);
      expect(api.calls, hasLength(1));
      expect(await restarted.actionStore.read('account', id), isEmpty);
    },
  );

  test(
    'Old or logged-out account alerts cannot mutate another account',
    () async {
      final scheduler = LocalReminders();
      await scheduler.initialize();
      await scheduler.sync('account', actions());
      final payload = pending.values.first['payload'] as String;
      await scheduler.clear();
      final api = NotificationApi();
      await scheduler.handleNotificationResponse(
        response(completeNotificationAction, payload),
        client: api,
      );
      await scheduler.handleNotificationResponse(
        response(snoozeNotificationAction, payload),
      );
      expect(api.calls, isEmpty);
      expect(await scheduler.actionStore.records('account'), isEmpty);
      expect(pending, isEmpty);
    },
  );

  test('An explicit due-date edit replaces an old snooze', () async {
    final scheduler = LocalReminders();
    await scheduler.initialize();
    final original = actions();
    await scheduler.sync('account', original);
    final payload = pending.values.first['payload'] as String;
    final id = ReminderPayload.parse(payload)!.id;
    await scheduler.handleNotificationResponse(
      response(snoozeNotificationAction, payload),
    );
    await scheduler.sync('account', [
      RecallAction({
        'id': id,
        'dueAt': DateTime.now().add(const Duration(hours: 2)).toIso8601String(),
      }),
    ]);
    expect(await scheduler.actionStore.read('account', id), isEmpty);
    expect(pending, hasLength(1));
  });
}
