import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'recall_api.dart';

const completeNotificationAction = 'recall_complete';
const snoozeNotificationAction = 'recall_snooze_5';

// Only account/action identifiers and display text travel with the OS alert.
// Session credentials stay in secure storage.
class ReminderPayload {
  final String account, id, title, body, kind;
  final String? dueAt;
  const ReminderPayload(
    this.account,
    this.id,
    this.title,
    this.body,
    this.kind, {
    this.dueAt,
  });

  String encode() => jsonEncode({
    'account': account,
    'id': id,
    'title': title,
    'body': body,
    'kind': kind,
    'dueAt': dueAt,
  });

  static ReminderPayload? parse(String? value) {
    try {
      final data = jsonDecode(value ?? '') as Map;
      if (data['account'] is! String ||
          data['id'] is! String ||
          (data['account'] as String).isEmpty ||
          (data['id'] as String).isEmpty) {
        return null;
      }
      return ReminderPayload(
        data['account'],
        data['id'],
        '${data['title'] ?? ''}',
        '${data['body'] ?? ''}',
        '${data['kind'] ?? 'follow_up'}',
        dueAt: data['dueAt'] as String?,
      );
    } catch (_) {
      return null; // Older alerts have no buttons and use a plain action ID.
    }
  }
}

class NotificationActionStore {
  final FlutterSecureStorage storage;
  // Notification intents must remain available to an iOS action callback after
  // the phone is locked. This applies to items written by this store only; the
  // login session continues to use the app's default when-unlocked protection.
  const NotificationActionStore({
    this.storage = const FlutterSecureStorage(
      iOptions: IOSOptions(
        accessibility: KeychainAccessibility.first_unlock_this_device,
      ),
    ),
  });
  static const accountKey = 'notification_account';
  String _key(String account, String id) =>
      'notification_action_${Uri.encodeComponent(account)}_${Uri.encodeComponent(id)}';

  Future<Map<String, dynamic>> read(String account, String id) async {
    final raw = await storage.read(key: _key(account, id));
    return raw == null ? {} : Map<String, dynamic>.from(jsonDecode(raw) as Map);
  }

  Future<void> write(ReminderPayload payload, Map<String, dynamic> state) =>
      storage.write(
        key: _key(payload.account, payload.id),
        value: jsonEncode({...state, 'payload': payload.encode()}),
      );

  Future<void> remove(String account, String id) =>
      storage.delete(key: _key(account, id));

  Future<Map<String, Map<String, dynamic>>> records(String account) async {
    final prefix = 'notification_action_${Uri.encodeComponent(account)}_';
    final result = <String, Map<String, dynamic>>{};
    for (final entry in (await storage.readAll()).entries) {
      if (!entry.key.startsWith(prefix)) continue;
      final data = Map<String, dynamic>.from(jsonDecode(entry.value) as Map);
      final payload = ReminderPayload.parse(data['payload'] as String?);
      if (payload?.account == account) result[payload!.id] = data;
    }
    return result;
  }

  // Retain the completion until a dashboard read confirms it. This prevents an
  // old in-memory snapshot from resurrecting the alert after a background POST.
  Future<bool> flush(String account, RecallApi api) async {
    var pending = false;
    for (final entry in (await records(account)).entries) {
      if (entry.value['done'] != true || entry.value['synced'] == true) {
        continue;
      }
      try {
        await api.post('action', {'id': entry.key, 'status': 'done'});
        final payload = ReminderPayload.parse(
          entry.value['payload'] as String,
        )!;
        await write(payload, {...entry.value, 'synced': true});
      } catch (_) {
        pending =
            true; // Keep the durable intent for the next authenticated load.
      }
    }
    return pending;
  }
}
