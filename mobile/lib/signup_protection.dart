import 'dart:async';
import 'dart:io';

import 'package:recaptcha_enterprise_flutter/recaptcha_enterprise_flutter.dart';

import 'recall_api.dart';

abstract class SignupProtection {
  Future<void> prepare();
  Future<Map<String, String>> verify();
}

class SignupProtectionException implements Exception {
  final String message;
  const SignupProtectionException(this.message);
  @override
  String toString() => message;
}

class GoogleSignupProtection implements SignupProtection {
  final RecallApi api;
  final String? platform;
  static final _clients = <String, Future<RecaptchaClient>>{};

  GoogleSignupProtection(this.api, {String? platform})
    : platform =
          platform ??
          (Platform.isAndroid
              ? 'android'
              : Platform.isIOS
              ? 'ios'
              : null);

  Future<String?> _siteKey() async {
    // Refresh server configuration for each attempt. The client never decides
    // to bypass a required check based on an SDK error or an absent mobile key.
    final config = await api.get('security');
    if (config['captchaRequired'] == false) return null;
    if (config['captchaRequired'] != true || platform == null) {
      throw const SignupProtectionException(
        'Account security checks are not ready. Please try again shortly.',
      );
    }
    final mobile = config['mobile'];
    final key = mobile is Map ? mobile['${platform}SiteKey'] : null;
    if (key is! String || key.trim().isEmpty) {
      throw const SignupProtectionException(
        'Account security checks are being set up. Your details are kept; please try again shortly.',
      );
    }
    return key;
  }

  Future<RecaptchaClient> _client(String key) async {
    final pending = _clients.putIfAbsent(
      key,
      () => Recaptcha.fetchClient(key).timeout(const Duration(seconds: 15)),
    );
    try {
      return await pending;
    } catch (_) {
      if (identical(_clients[key], pending)) _clients.remove(key);
      throw const SignupProtectionException(
        'Could not load the security check. Check your connection and try again.',
      );
    }
  }

  @override
  Future<void> prepare() async {
    final key = await _siteKey();
    if (key != null) await _client(key);
  }

  @override
  Future<Map<String, String>> verify() async {
    final key = await _siteKey();
    if (key == null) {
      return {}; // Explicit server-side development setting only.
    }
    final client = await _client(key);
    try {
      final token = await client
          .execute(RecaptchaAction.SIGNUP(), timeout: 10000)
          .timeout(const Duration(seconds: 15));
      if (token.isEmpty) throw const FormatException();
      // Fresh execute on every submit; never cache or reuse a token after failure.
      return {
        'captchaProvider': 'recaptcha_enterprise',
        'captchaPlatform': platform!,
        'captchaToken': token,
      };
    } catch (_) {
      throw const SignupProtectionException(
        'The security check did not finish. Your details are kept; please retry.',
      );
    }
  }
}
