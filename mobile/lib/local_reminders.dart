import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:timezone/data/latest.dart' as tz_data;
import 'package:timezone/timezone.dart' as tz;
import 'recall_api.dart';

class PlannedReminder {
  final RecallAction action;
  final DateTime at;
  final bool leadTimePassed;
  PlannedReminder(this.action, this.at, this.leadTimePassed);
}

List<PlannedReminder> planReminders(List<RecallAction> actions, DateTime now) {
  final planned = <PlannedReminder>[];
  for (final action in actions) {
    if (action.status != 'pending' ||
        action.dueAt == null ||
        !action.timeSpecified ||
        !action.dueAt!.isAfter(now)) {
      continue;
    }
    final requested = action.dueAt!.subtract(
      Duration(minutes: action.reminderMinutes),
    );
    // A missed advance reminder must not suppress a still-future meeting.
    planned.add(
      PlannedReminder(
        action,
        requested.isAfter(now) ? requested : action.dueAt!,
        !requested.isAfter(now),
      ),
    );
  }
  planned.sort((a, b) => a.at.compareTo(b.at));
  return planned.take(50).toList();
}

class LocalReminders extends ChangeNotifier {
  static const testId = 2000000000;
  final FlutterLocalNotificationsPlugin plugin;
  bool ready = false, enabled = false, exact = false, channelBlocked = false;
  int scheduledCount = 0, untimedCount = 0, fallbackCount = 0;
  String? error;
  DateTime? nextAt, testAt;
  String? activeAccount;
  Future<void> _queue = Future.value();
  LocalReminders({FlutterLocalNotificationsPlugin? plugin})
    : plugin = plugin ?? FlutterLocalNotificationsPlugin();

  Future<void> initialize() async {
    tz_data.initializeTimeZones();
    if (kIsWeb) return;
    try {
      await plugin.initialize(
        settings: const InitializationSettings(
          android: AndroidInitializationSettings('@mipmap/ic_launcher'),
          iOS: DarwinInitializationSettings(
            requestAlertPermission: false,
            requestBadgePermission: false,
            requestSoundPermission: false,
          ),
        ),
      );
      ready = true;
      await refreshStatus();
    } catch (_) {
      error =
          'Phone reminders could not start. Restart Recall and check notification permissions.';
      notifyListeners();
    }
  }

  Future<void> refreshStatus() async {
    if (!ready) return;
    try {
      final android = plugin
          .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin
          >();
      final ios = plugin
          .resolvePlatformSpecificImplementation<
            IOSFlutterLocalNotificationsPlugin
          >();
      final iosPermissions = await ios?.checkPermissions();
      enabled =
          await android?.areNotificationsEnabled() ??
          (iosPermissions?.isEnabled == true &&
              iosPermissions?.isAlertEnabled == true);
      exact = android == null
          ? true
          : await android.canScheduleExactNotifications() ?? false;
      final channels = await android?.getNotificationChannels();
      channelBlocked =
          channels?.any(
            (c) =>
                c.id == 'recall_followups' && c.importance == Importance.none,
          ) ??
          false;
      final pending = await plugin.pendingNotificationRequests();
      scheduledCount = pending.where((p) => p.id != testId).length;
    } catch (_) {
      error = 'Could not check phone reminder settings.';
    }
    notifyListeners();
  }

  Future<bool> requestPermission() async {
    if (!ready) await initialize();
    if (!ready) return false;
    final android = plugin
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >();
    await android?.requestNotificationsPermission();
    if (android != null &&
        await android.canScheduleExactNotifications() == false) {
      await android.requestExactAlarmsPermission();
    }
    await plugin
        .resolvePlatformSpecificImplementation<
          IOSFlutterLocalNotificationsPlugin
        >()
        ?.requestPermissions(alert: true, badge: true, sound: true);
    await refreshStatus();
    return enabled && !channelBlocked;
  }

  int _id(String user, String action) {
    var hash = 0x811c9dc5;
    for (final code in '$user:$action'.codeUnits) {
      hash = ((hash ^ code) * 0x01000193) & 0x3fffffff;
    }
    return hash;
  }

  static String titleFor(String kind) => switch (kind) {
    'meeting' => 'Meeting reminder',
    'reminder' => 'Recall reminder',
    _ => 'Follow-up reminder',
  };
  static const details = NotificationDetails(
    android: AndroidNotificationDetails(
      'recall_followups',
      'Recall follow-ups',
      channelDescription: 'Meetings, reminders and follow-ups',
      importance: Importance.high,
      priority: Priority.high,
      playSound: true,
    ),
    iOS: DarwinNotificationDetails(
      presentAlert: true,
      presentSound: true,
      presentBadge: true,
    ),
  );

  Future<void> sync(String userId, List<RecallAction> actions) {
    if (!ready) return Future.value();
    // Serialize reloads, permission returns, saves and completions.
    final snapshot = List<RecallAction>.from(actions);
    final result = _queue
        .catchError((_) {})
        .then((_) => _sync(userId, snapshot));
    _queue = result;
    return result;
  }

  Future<void> _sync(String userId, List<RecallAction> actions) async {
    if (!ready) return;
    error = null;
    try {
      if (activeAccount != null && activeAccount != userId) {
        await plugin.cancelAll();
      }
      activeAccount = userId;
      await refreshStatus();
      untimedCount = actions
          .where(
            (a) =>
                a.status == 'pending' && (a.dueAt == null || !a.timeSpecified),
          )
          .length;
      final wanted = <int>{};
      final plans = planReminders(actions, DateTime.now());
      fallbackCount = plans.where((p) => p.leadTimePassed).length;
      nextAt = null;
      if (enabled && !channelBlocked) {
        var failures = 0;
        for (final plan in plans) {
          final id = _id(userId, plan.action.id);
          try {
            await plugin.zonedSchedule(
              id: id,
              title: titleFor(plan.action.kind),
              body: plan.action.contactName.isEmpty
                  ? plan.action.title
                  : '${plan.action.contactName}: ${plan.action.title}',
              scheduledDate: tz.TZDateTime.from(
                plan.at,
                tz.getLocation('Asia/Kolkata'),
              ),
              notificationDetails: details,
              androidScheduleMode: exact
                  ? AndroidScheduleMode.exactAllowWhileIdle
                  : AndroidScheduleMode.inexactAllowWhileIdle,
              payload: plan.action.id,
            );
            wanted.add(id);
            nextAt ??= plan.at;
          } catch (_) {
            failures++;
            await plugin.cancel(id: id);
          }
        }
        if (failures > 0) {
          error =
              '$failures reminder${failures == 1 ? '' : 's'} could not be scheduled. Check permissions and retry.';
        }
      }
      // Read the OS queue so stale alarms are removed after an app restart too.
      for (final existing in await plugin.pendingNotificationRequests()) {
        if (existing.id != testId && !wanted.contains(existing.id)) {
          await plugin.cancel(id: existing.id);
        }
      }
      scheduledCount = wanted.length;
    } catch (_) {
      error = 'Could not schedule reminders. Open Phone reminders and retry.';
    }
    notifyListeners();
  }

  Future<DateTime> testReminder({
    Duration delay = const Duration(minutes: 1),
  }) async {
    if (!await requestPermission()) {
      throw StateError(
        'Notifications are blocked. Enable Recall notifications in your phone settings.',
      );
    }
    if (!exact) {
      throw StateError(
        'Allow precise alarms before running the one-minute delivery test.',
      );
    }
    final at = DateTime.now().add(delay);
    await plugin.zonedSchedule(
      id: testId,
      title: 'Recall test reminder',
      body:
          'Your phone reminder works. This alert is scheduled on this device.',
      scheduledDate: tz.TZDateTime.from(at, tz.getLocation('Asia/Kolkata')),
      notificationDetails: details,
      androidScheduleMode: exact
          ? AndroidScheduleMode.exactAllowWhileIdle
          : AndroidScheduleMode.inexactAllowWhileIdle,
      payload: 'test',
    );
    testAt = at;
    notifyListeners();
    return at;
  }

  Future<void> clear() async {
    if (!ready) return;
    await _queue.catchError((_) {});
    if (ready) await plugin.cancelAll();
    activeAccount = null;
    scheduledCount = 0;
    nextAt = null;
    testAt = null;
    notifyListeners();
  }
}
