import 'dart:async';
import 'package:flutter/widgets.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:timezone/data/latest.dart' as tz_data;
import 'package:timezone/timezone.dart' as tz;
import 'recall_api.dart';
import 'notification_actions.dart';

@pragma('vm:entry-point')
void reminderNotificationBackground(NotificationResponse response) async {
  WidgetsFlutterBinding.ensureInitialized();
  final scheduler = LocalReminders();
  await scheduler.initialize();
  await scheduler.handleNotificationResponse(response);
}

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
  static const actionCategory = 'recall_followup_actions';
  final FlutterLocalNotificationsPlugin plugin;
  bool ready = false, enabled = false, exact = false, channelBlocked = false;
  int scheduledCount = 0, untimedCount = 0, fallbackCount = 0;
  String? error;
  DateTime? nextAt, testAt;
  String? activeAccount;
  Future<void> Function()? onNotificationAction;
  final NotificationActionStore actionStore;
  Future<void> _queue = Future.value();
  LocalReminders({
    FlutterLocalNotificationsPlugin? plugin,
    this.actionStore = const NotificationActionStore(),
  }) : plugin = plugin ?? FlutterLocalNotificationsPlugin();

  Future<void> initialize() async {
    tz_data.initializeTimeZones();
    if (kIsWeb) return;
    try {
      await plugin.initialize(
        settings: InitializationSettings(
          android: const AndroidInitializationSettings('@mipmap/ic_launcher'),
          iOS: DarwinInitializationSettings(
            requestAlertPermission: false,
            requestBadgePermission: false,
            requestSoundPermission: false,
            notificationCategories: [
              DarwinNotificationCategory(
                actionCategory,
                actions: [
                  DarwinNotificationAction.plain(
                    completeNotificationAction,
                    'Mark completed',
                  ),
                  DarwinNotificationAction.plain(
                    snoozeNotificationAction,
                    'Remind in 5 minutes',
                  ),
                ],
              ),
            ],
          ),
        ),
        onDidReceiveBackgroundNotificationResponse:
            reminderNotificationBackground,
        onDidReceiveNotificationResponse: (response) async {
          await handleNotificationResponse(response);
          await onNotificationAction?.call();
        },
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
  static const actionDetails = NotificationDetails(
    android: AndroidNotificationDetails(
      'recall_followups',
      'Recall follow-ups',
      channelDescription: 'Meetings, reminders and follow-ups',
      importance: Importance.high,
      priority: Priority.high,
      playSound: true,
      actions: [
        AndroidNotificationAction(completeNotificationAction, 'Mark completed'),
        AndroidNotificationAction(
          snoozeNotificationAction,
          'Remind in 5 minutes',
        ),
      ],
    ),
    iOS: DarwinNotificationDetails(
      categoryIdentifier: actionCategory,
      presentAlert: true,
      presentSound: true,
      presentBadge: true,
    ),
  );

  Future<void> _schedule(ReminderPayload payload, DateTime at) async {
    await plugin.zonedSchedule(
      id: _id(payload.account, payload.id),
      title: titleFor(payload.kind),
      body: payload.body,
      scheduledDate: tz.TZDateTime.from(at, tz.getLocation('Asia/Kolkata')),
      notificationDetails: actionDetails,
      androidScheduleMode: exact
          ? AndroidScheduleMode.exactAllowWhileIdle
          : AndroidScheduleMode.inexactAllowWhileIdle,
      payload: payload.encode(),
    );
  }

  Future<void> handleNotificationResponse(
    NotificationResponse response, {
    RecallApi? client,
  }) async {
    if (response.actionId != completeNotificationAction &&
        response.actionId != snoozeNotificationAction) {
      return;
    }
    final payload = ReminderPayload.parse(response.payload);
    if (payload == null) return;
    var completionSaved = false;
    try {
      final account = await actionStore.storage.read(
        key: NotificationActionStore.accountKey,
      );
      if (account != payload.account) return;
      final previous = await actionStore.read(account!, payload.id);
      if (response.actionId == completeNotificationAction) {
        await actionStore.write(payload, {'done': true});
        completionSaved = true;
        await plugin.cancel(id: _id(account, payload.id));
        // Background callbacks have no Activity. No navigation or permission
        // prompts are needed, and the intent is persisted before networking.
        // iOS may withhold the login keychain item while locked. The completion
        // is already saved and will sync on the next authenticated app load.
        final token = await actionStore.storage.read(key: 'session');
        if (token == null) return;
        final api = client ?? RecallApi(token);
        final me = await api.get('me');
        if ('${(me['user'] as Map?)?['id']}' == account) {
          await actionStore.flush(account, api);
        }
      } else {
        if (previous['done'] == true) return;
        final at = DateTime.now().add(const Duration(minutes: 5));
        await actionStore.write(payload, {
          'snoozeAt': at.toUtc().toIso8601String(),
        });
        await _schedule(payload, at);
      }
    } catch (_) {
      // A completion is already durable before any network call. Scheduling
      // failures are surfaced rather than pretending another alert is queued.
      if (!completionSaved) {
        error = 'Could not update this alert. Open Recall to retry.';
        await plugin.show(
          id: _id(payload.account, payload.id),
          title: 'Reminder needs attention',
          body: error!,
          notificationDetails: details,
          payload: payload.encode(),
        );
      }
    }
    notifyListeners();
  }

  Future<void> reconcileNotificationActions(
    String account,
    List<RecallAction> actions,
    RecallApi api, {
    bool serverSnapshot = true,
  }) async {
    await actionStore.flush(account, api);
    for (final entry in (await actionStore.records(account)).entries) {
      for (final action in actions.where((a) => a.id == entry.key)) {
        if (entry.value['done'] == true) {
          if (serverSnapshot && action.status != 'pending') {
            await actionStore.remove(account, action.id);
          } else {
            action.status = 'done';
          }
        }
      }
    }
  }

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
      await actionStore.storage.write(
        key: NotificationActionStore.accountKey,
        value: userId,
      );
      await refreshStatus();
      untimedCount = actions
          .where(
            (a) =>
                a.status == 'pending' && (a.dueAt == null || !a.timeSpecified),
          )
          .length;
      final wanted = <int>{};
      final states = await actionStore.records(userId);
      final now = DateTime.now();
      final eligible = actions
          .where((a) => states[a.id]?['done'] != true)
          .toList();
      final snoozed = <String, DateTime>{};
      for (final action in eligible) {
        final saved = states[action.id];
        final previous = ReminderPayload.parse(saved?['payload'] as String?);
        if (saved?['snoozeAt'] != null &&
            previous?.dueAt != action.dueAt?.toUtc().toIso8601String()) {
          // An explicit reschedule in Recall supersedes a local snooze.
          await actionStore.remove(userId, action.id);
          states.remove(action.id);
        }
        final at = DateTime.tryParse('${states[action.id]?['snoozeAt'] ?? ''}');
        if (at != null && at.isAfter(now) && action.status == 'pending') {
          snoozed[action.id] = at;
        }
      }
      final plans = [
        ...planReminders(
          eligible
              .where(
                (a) =>
                    !snoozed.containsKey(a.id) &&
                    states[a.id]?['snoozeAt'] == null,
              )
              .toList(),
          now,
        ),
        for (final action in eligible.where((a) => snoozed.containsKey(a.id)))
          PlannedReminder(action, snoozed[action.id]!, false),
      ]..sort((a, b) => a.at.compareTo(b.at));
      fallbackCount = plans.where((p) => p.leadTimePassed).length;
      nextAt = null;
      if (enabled && !channelBlocked) {
        var failures = 0;
        for (final plan in plans.take(50)) {
          final id = _id(userId, plan.action.id);
          try {
            await _schedule(
              ReminderPayload(
                userId,
                plan.action.id,
                plan.action.title,
                plan.action.contactName.isEmpty
                    ? plan.action.title
                    : '${plan.action.contactName}: ${plan.action.title}',
                plan.action.kind,
                dueAt: plan.action.dueAt?.toUtc().toIso8601String(),
              ),
              plan.at,
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
      if (states.values.any((s) => s['done'] == true && s['synced'] != true)) {
        error =
            'Completion saved on this phone. Open Recall when online to sync.';
      }
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
    await _queue.catchError((_) {});
    await actionStore.storage.delete(key: NotificationActionStore.accountKey);
    if (!ready) return;
    if (ready) await plugin.cancelAll();
    activeAccount = null;
    scheduledCount = 0;
    nextAt = null;
    testAt = null;
    notifyListeners();
  }
}
