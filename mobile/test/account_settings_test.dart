import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:recall_mobile/account_settings.dart';

void main() {
  testWidgets(
    'Deletion requires password and explicit confirmation; failures remain retryable',
    (tester) async {
      var calls = 0;
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: AccountSettings(
              onDelete: (password) async {
                calls++;
                expect(password, 'test-password');
                throw Exception('offline');
              },
            ),
          ),
        ),
      );
      await tester.tap(find.text('Delete account'));
      await tester.pumpAndSettle();
      FilledButton button() => tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'Delete permanently'),
      );
      expect(button().onPressed, isNull);
      await tester.enterText(find.byType(TextField), 'test-password');
      await tester.pump();
      expect(button().onPressed, isNull);
      await tester.tap(find.byType(CheckboxListTile));
      await tester.pump();
      expect(button().onPressed, isNotNull);
      await tester.tap(find.text('Delete permanently'));
      await tester.pumpAndSettle();
      expect(calls, 1);
      expect(find.textContaining('Could not delete'), findsOneWidget);
      expect(find.byType(TextField), findsOneWidget);
      expect(button().onPressed, isNotNull);
    },
  );
}
