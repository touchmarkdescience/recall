import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recall_mobile/local_reminders.dart';
import 'package:recall_mobile/notification_actions.dart';
import 'package:recall_mobile/recall_api.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('dexterous.com/flutter/local_notifications');
  late Map<String, dynamic> initialization;
  late Map<int, Map<String, dynamic>> pending;

  setUp(() {
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    IOSFlutterLocalNotificationsPlugin.registerWith();
    FlutterSecureStorage.setMockInitialValues({});
    initialization = {};
    pending = {};
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
          switch (call.method) {
            case 'initialize':
              initialization = Map<String, dynamic>.from(call.arguments as Map);
              return true;
            case 'checkPermissions':
              return {'isEnabled': true, 'isAlertEnabled': true};
            case 'pendingNotificationRequests':
              return pending.values.toList();
            case 'zonedSchedule':
              final args = Map<String, dynamic>.from(call.arguments as Map);
              pending[args['id'] as int] = args;
              return null;
            case 'cancel':
              pending.remove(call.arguments as int);
              return null;
            case 'cancelAll':
              pending.clear();
              return null;
          }
          return null;
        });
  });
  tearDown(() {
    debugDefaultTargetPlatformOverride = null;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, null);
  });

  RecallAction action() => RecallAction({
    'id': 'meeting',
    'kind': 'meeting',
    'title': 'Discuss the proposal',
    'dueAt': DateTime.now().add(const Duration(minutes: 1)).toIso8601String(),
  });
  NotificationResponse response(String id, String payload) =>
      NotificationResponse(
        notificationResponseType:
            NotificationResponseType.selectedNotificationAction,
        actionId: id,
        payload: payload,
      );

  test(
    'iOS registers both background actions and attaches the category to alerts',
    () async {
      final scheduler = LocalReminders();
      await scheduler.initialize();
      final category =
          (initialization['notificationCategories'] as List).single as Map;
      expect(category['identifier'], LocalReminders.actionCategory);
      expect((category['actions'] as List).map((a) => a['identifier']), [
        completeNotificationAction,
        snoozeNotificationAction,
      ]);
      expect((category['actions'] as List).map((a) => a['title']), [
        'Mark completed',
        'Remind in 5 minutes',
      ]);
      expect(
        (category['actions'] as List).every(
          (a) => (a['options'] as List).isEmpty,
        ),
        true,
      );
      await scheduler.sync('account', [action()]);
      expect(
        (pending.values.single['platformSpecifics']
            as Map)['categoryIdentifier'],
        LocalReminders.actionCategory,
      );
    },
  );

  test(
    'iOS snoozes offline without a login credential and preserves the original due time',
    () async {
      final scheduler = LocalReminders();
      await scheduler.initialize();
      final task = action();
      final due = task.dueAt;
      await scheduler.sync('account', [task]);
      final payload = pending.values.single['payload'] as String;
      final now = DateTime.now();
      await scheduler.handleNotificationResponse(
        response(snoozeNotificationAction, payload),
      );
      final saved = await scheduler.actionStore.read('account', task.id);
      expect(
        DateTime.parse(saved['snoozeAt']).difference(now).inSeconds,
        inInclusiveRange(299, 301),
      );
      await scheduler.sync('account', [task]);
      expect(task.dueAt, due);
      expect(
        (pending.values.single['platformSpecifics']
            as Map)['categoryIdentifier'],
        LocalReminders.actionCategory,
      );
    },
  );

  test(
    'iOS saves completion when the session is unavailable and ignores a later snooze',
    () async {
      final scheduler = LocalReminders();
      await scheduler.initialize();
      final task = action();
      await scheduler.sync('account', [task]);
      final payload = pending.values.single['payload'] as String;
      await scheduler.handleNotificationResponse(
        response(completeNotificationAction, payload),
      );
      expect(
        (await scheduler.actionStore.read('account', task.id))['done'],
        true,
      );
      expect(pending, isEmpty);
      await scheduler.handleNotificationResponse(
        response(snoozeNotificationAction, payload),
      );
      await scheduler.sync('account', [task]);
      expect(pending, isEmpty);
      expect(scheduler.error, contains('Completion saved on this phone'));
    },
  );

  test(
    'sign-out disables old actions even when notification initialization failed',
    () async {
      const store = NotificationActionStore();
      await store.storage.write(
        key: NotificationActionStore.accountKey,
        value: 'account',
      );
      final scheduler = LocalReminders();
      await scheduler.clear();
      expect(
        await store.storage.read(key: NotificationActionStore.accountKey),
        isNull,
      );
    },
  );
}
