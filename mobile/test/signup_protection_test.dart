import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recall_mobile/recall_api.dart';
import 'package:recall_mobile/signup_protection.dart';

class SecurityApi extends RecallApi {
  Map<String, dynamic> config;
  SecurityApi(this.config) : super(null);
  @override
  Future<Map<String, dynamic>> get(String route) async {
    expect(route, 'security');
    return config;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('recaptcha_enterprise');
  final messenger =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
  tearDown(() => messenger.setMockMethodCallHandler(channel, null));

  test(
    'SDK initializes once and creates a new SIGNUP token each attempt',
    () async {
      final calls = <MethodCall>[];
      var executions = 0;
      messenger.setMockMethodCallHandler(channel, (call) async {
        calls.add(call);
        if (call.method == 'fetchClient') return true;
        return 'token-${++executions}';
      });
      final api = SecurityApi({
        'captchaRequired': true,
        'mobile': {'androidSiteKey': 'native-unit-key'},
      });
      final protection = GoogleSignupProtection(api, platform: 'android');
      await protection.prepare();
      expect((await protection.verify())['captchaToken'], 'token-1');
      expect((await protection.verify())['captchaToken'], 'token-2');
      expect(calls.where((c) => c.method == 'fetchClient').length, 1);
      expect(calls.where((c) => c.method == 'execute').length, 2);
      for (final call in calls.where((c) => c.method == 'execute')) {
        expect(call.arguments['action'], 'signup');
        expect(call.arguments['timeout'], 10000);
      }
    },
  );

  test(
    'Missing native configuration fails closed without calling the SDK',
    () async {
      var calls = 0;
      messenger.setMockMethodCallHandler(channel, (_) async {
        calls++;
        return true;
      });
      final api = SecurityApi({
        'captchaRequired': true,
        'mobile': {'androidSiteKey': null},
      });
      final protection = GoogleSignupProtection(api, platform: 'android');
      await expectLater(
        protection.verify(),
        throwsA(isA<SignupProtectionException>()),
      );
      api.config = {};
      await expectLater(
        protection.verify(),
        throwsA(isA<SignupProtectionException>()),
      );
      expect(calls, 0);
    },
  );

  test('Only explicit server-side disable skips the native check', () async {
    var calls = 0;
    messenger.setMockMethodCallHandler(channel, (_) async {
      calls++;
      return true;
    });
    final protection = GoogleSignupProtection(
      SecurityApi({'captchaRequired': false}),
      platform: 'android',
    );
    expect(await protection.verify(), isEmpty);
    expect(calls, 0);
  });

  test(
    'SDK failure does not bypass verification and the next attempt can retry',
    () async {
      var executions = 0;
      messenger.setMockMethodCallHandler(channel, (call) async {
        if (call.method == 'fetchClient') return true;
        if (++executions == 1) throw PlatformException(code: 'NETWORK_ERROR');
        return 'fresh-after-error';
      });
      final protection = GoogleSignupProtection(
        SecurityApi({
          'captchaRequired': true,
          'mobile': {'androidSiteKey': 'retry-unit-key'},
        }),
        platform: 'android',
      );
      await expectLater(
        protection.verify(),
        throwsA(isA<SignupProtectionException>()),
      );
      expect((await protection.verify())['captchaToken'], 'fresh-after-error');
      expect(executions, 2);
    },
  );
}
