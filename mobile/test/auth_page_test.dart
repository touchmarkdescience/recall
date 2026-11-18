import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recall_mobile/main.dart';
import 'package:recall_mobile/signup_protection.dart';

class FakeProtection implements SignupProtection {
  int preparations = 0, verifications = 0;
  bool fail = false;
  Completer<void>? preparation;
  @override
  Future<void> prepare() async {
    preparations++;
    await preparation?.future;
  }

  @override
  Future<Map<String, String>> verify() async {
    verifications++;
    if (fail) {
      throw const SignupProtectionException('Security check failed; retry.');
    }
    return {
      'captchaProvider': 'recaptcha_enterprise',
      'captchaPlatform': 'android',
      'captchaToken': 'fresh-$verifications',
    };
  }
}

Future<void> fillSignup(WidgetTester tester) async {
  await tester.ensureVisible(find.text('Create an account'));
  await tester.tap(find.text('Create an account'));
  await tester.pumpAndSettle();
  await tester.enterText(find.byKey(const ValueKey('auth-name')), 'Alex');
  await tester.enterText(
    find.byKey(const ValueKey('auth-email')),
    ' alex@example.test ',
  );
  await tester.enterText(
    find.byKey(const ValueKey('auth-password')),
    'test-password',
  );
  await tester.ensureVisible(find.byKey(const ValueKey('auth-submit')));
}

void main() {
  testWidgets('Creates an account in-app with a verified native token', (
    tester,
  ) async {
    final protection = FakeProtection();
    final calls = <Map<String, dynamic>>[];
    await tester.pumpWidget(
      MaterialApp(
        home: AuthPage(
          signupProtection: protection,
          onSubmit: (email, password, {name, signupProof}) async {
            calls.add({
              'email': email,
              'password': password,
              'name': name,
              'proof': signupProof,
            });
          },
        ),
      ),
    );
    await fillSignup(tester);
    await tester.tap(find.byKey(const ValueKey('auth-submit')));
    await tester.pumpAndSettle();
    expect(protection.preparations, 1);
    expect(protection.verifications, 1);
    expect(calls.single['name'], 'Alex');
    expect(calls.single['email'], 'alex@example.test');
    expect(calls.single['proof']['captchaToken'], 'fresh-1');
    expect(find.textContaining('browser'), findsNothing);
  });

  testWidgets('Failed security never submits signup and preserves all inputs', (
    tester,
  ) async {
    final protection = FakeProtection()..fail = true;
    var calls = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: AuthPage(
          signupProtection: protection,
          onSubmit: (_, _, {name, signupProof}) async {
            calls++;
          },
        ),
      ),
    );
    await fillSignup(tester);
    await tester.tap(find.byKey(const ValueKey('auth-submit')));
    await tester.pumpAndSettle();
    expect(calls, 0);
    expect(find.text('Security check failed; retry.'), findsOneWidget);
    expect(
      tester
          .widget<TextFormField>(find.byKey(const ValueKey('auth-name')))
          .controller!
          .text,
      'Alex',
    );
    expect(
      tester
          .widget<TextFormField>(find.byKey(const ValueKey('auth-password')))
          .controller!
          .text,
      'test-password',
    );
    protection.fail = false;
    await tester.ensureVisible(find.byKey(const ValueKey('auth-submit')));
    await tester.tap(find.byKey(const ValueKey('auth-submit')));
    await tester.pumpAndSettle();
    expect(calls, 1);
    expect(protection.verifications, 2);
  });

  testWidgets('A rejected save gets a fresh security token on retry', (
    tester,
  ) async {
    final protection = FakeProtection();
    final tokens = <String>[];
    await tester.pumpWidget(
      MaterialApp(
        home: AuthPage(
          signupProtection: protection,
          onSubmit: (_, _, {name, signupProof}) async {
            tokens.add(signupProof!['captchaToken']!);
            if (tokens.length == 1) throw Exception('Please retry signup');
          },
        ),
      ),
    );
    await fillSignup(tester);
    await tester.tap(find.byKey(const ValueKey('auth-submit')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const ValueKey('auth-submit')));
    await tester.tap(find.byKey(const ValueKey('auth-submit')));
    await tester.pumpAndSettle();
    expect(tokens, ['fresh-1', 'fresh-2']);
  });

  testWidgets(
    'Preparing security is visible and returning to login stays usable',
    (tester) async {
      final pending = Completer<void>();
      final protection = FakeProtection()..preparation = pending;
      await tester.pumpWidget(
        MaterialApp(
          home: AuthPage(
            signupProtection: protection,
            onSubmit: (_, _, {name, signupProof}) async {},
          ),
        ),
      );
      await tester.ensureVisible(find.text('Create an account'));
      await tester.tap(find.text('Create an account'));
      await tester.pump();
      expect(find.text('Preparing security check…'), findsOneWidget);
      expect(
        tester
            .widget<ElevatedButton>(find.byKey(const ValueKey('auth-submit')))
            .onPressed,
        isNull,
      );
      await tester.ensureVisible(find.text('I have an account'));
      await tester.tap(find.text('I have an account'));
      await tester.pump();
      pending.complete();
      await tester.pumpAndSettle();
      expect(find.text('Sign in'), findsOneWidget);
      expect(
        tester
            .widget<ElevatedButton>(find.byKey(const ValueKey('auth-submit')))
            .onPressed,
        isNotNull,
      );
    },
  );

  testWidgets('Invalid signup fields do not execute security or submit', (
    tester,
  ) async {
    final protection = FakeProtection();
    var calls = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: AuthPage(
          signupProtection: protection,
          onSubmit: (_, _, {name, signupProof}) async {
            calls++;
          },
        ),
      ),
    );
    await tester.ensureVisible(find.text('Create an account'));
    await tester.tap(find.text('Create an account'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const ValueKey('auth-submit')));
    await tester.tap(find.byKey(const ValueKey('auth-submit')));
    await tester.pumpAndSettle();
    expect(calls, 0);
    expect(protection.verifications, 0);
  });

  testWidgets('Existing-account sign-in does not run CAPTCHA', (tester) async {
    final protection = FakeProtection();
    var calls = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: AuthPage(
          signupProtection: protection,
          onSubmit: (email, password, {name, signupProof}) async {
            calls++;
            expect(email, 'alex@example.test');
            expect(password, 'test-password');
            expect(name, isNull);
            expect(signupProof, isNull);
          },
        ),
      ),
    );
    await tester.enterText(
      find.byKey(const ValueKey('auth-email')),
      'alex@example.test',
    );
    await tester.enterText(
      find.byKey(const ValueKey('auth-password')),
      'test-password',
    );
    await tester.ensureVisible(find.byKey(const ValueKey('auth-submit')));
    await tester.tap(find.byKey(const ValueKey('auth-submit')));
    await tester.pumpAndSettle();
    expect(calls, 1);
    expect(protection.preparations, 0);
    expect(protection.verifications, 0);
  });
}
