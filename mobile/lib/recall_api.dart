import 'dart:convert';
import 'dart:io';
import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

const configuredApiUrl = String.fromEnvironment('RECALL_API_URL');
String get apiUrl {
  if (kReleaseMode) {
    final uri = Uri.tryParse(configuredApiUrl);
    if (uri == null ||
        uri.scheme != 'https' ||
        uri.host.isEmpty ||
        uri.host == 'localhost' ||
        uri.host == '127.0.0.1') {
      throw StateError('Release builds require an HTTPS RECALL_API_URL.');
    }
  }
  return configuredApiUrl.isNotEmpty
      ? configuredApiUrl.replaceFirst(RegExp(r'/$'), '')
      : Platform.isAndroid
      ? 'http://10.0.2.2:3000'
      : 'http://127.0.0.1:3000';
}

class RecallApi {
  String? token;
  RecallApi(this.token);

  Future<Map<String, dynamic>> get(String route) => _request('GET', route);
  Future<Map<String, dynamic>> delete(
    String route,
    Map<String, dynamic> body,
  ) => _request('DELETE', route, body);

  Future<Map<String, dynamic>> post(String route, Map<String, dynamic> body) =>
      _request('POST', route, body);

  Future<Map<String, dynamic>> _request(
    String method,
    String route, [
    Map<String, dynamic>? body,
  ]) async {
    try {
      final request = http.Request(method, Uri.parse('$apiUrl/api/$route'))
        ..headers.addAll({
          'Content-Type': 'application/json',
          'X-Recall-Client': 'native',
          if (token != null) 'Authorization': 'Bearer $token',
          if (token != null) 'Cookie': 'recall_session=$token',
        })
        ..body = body == null ? '' : jsonEncode(body);
      final client = http.Client();
      late http.StreamedResponse streamed;
      late String raw;
      try {
        streamed = await client
            .send(request)
            .timeout(const Duration(seconds: 25));
        raw = await streamed.stream.bytesToString();
      } finally {
        client.close();
      }
      final data = jsonDecode(raw);
      if (streamed.statusCode >= 400) {
        throw RecallApiError(
          data is Map
              ? '${data['error'] ?? 'Request failed'}'
              : 'Request failed',
          streamed.statusCode,
        );
      }
      final result = Map<String, dynamic>.from(data as Map);
      // Existing Recall servers authenticate through the session cookie.
      // Native HTTP can read this header and keep the session in secure storage.
      if ((route == 'login' || route == 'register') &&
          result['token'] == null) {
        final cookie = streamed.headers['set-cookie'] ?? '';
        final session = RegExp(
          r'recall_session=([^;,\s]+)',
        ).firstMatch(cookie)?.group(1);
        if (session != null) result['token'] = session;
      }
      return result;
    } on SocketException {
      throw RecallApiError(
        'You are offline. Reconnect to sync with Recall.',
        0,
      );
    } on TimeoutException {
      throw RecallApiError(
        'Recall took too long to respond. Your note is still here; retry when connected.',
        0,
      );
    } on http.ClientException {
      throw RecallApiError(
        'Cannot reach Recall right now. Your note is still here; retry when connected.',
        0,
      );
    } on FormatException {
      throw RecallApiError('Recall received an unexpected server response.', 0);
    }
  }
}

class RecallApiError implements Exception {
  final String message;
  final int status;
  RecallApiError(this.message, this.status);
  @override
  String toString() => message;
}

class RecallAction {
  final String id, title, kind, contactName, originalNote;
  String status;
  final DateTime? createdAt;
  final DateTime? dueAt;
  final int reminderMinutes;
  final bool timeSpecified;
  RecallAction(Map<String, dynamic> json)
    : createdAt = DateTime.tryParse('${json['createdAt'] ?? ''}'),
      id = '${json['id'] ?? ''}',
      title = '${json['title'] ?? ''}',
      originalNote = '${json['originalNote'] ?? ''}',
      kind = '${json['kind'] ?? 'follow_up'}',
      status = '${json['status'] ?? 'pending'}',
      contactName = '${json['contactName'] ?? ''}',
      dueAt = DateTime.tryParse('${json['dueAt'] ?? ''}'),
      reminderMinutes = (json['reminderMinutes'] as num?)?.toInt() ?? 0,
      timeSpecified =
          json['timeSpecified'] != false && json['timeSpecified'] != 0;
}

class RecallContact {
  final String id, name;
  RecallContact(Map<String, dynamic> json)
    : id = '${json['id'] ?? ''}',
      name = '${json['name'] ?? ''}';
}
