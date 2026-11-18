import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:timezone/data/latest.dart' as tz_data;
import 'package:recall_mobile/main.dart';
import 'package:recall_mobile/action_view.dart';
import 'package:recall_mobile/recall_api.dart';

class DelayedApi extends RecallApi {
  final update = Completer<Map<String, dynamic>>();
  final reads = <String>[];
  bool done = false;
  DelayedApi() : super(null);
  @override
  Future<Map<String, dynamic>> get(String route) async {
    reads.add(route);
    if (route == 'me') {
      return {
        'user': {'id': 'test-user', 'name': 'Sales'},
      };
    }
    return {
      'contacts': [],
      'actions': [
        {
          'id': 'one',
          'title': 'Send the proposal',
          'status': done ? 'done' : 'pending',
          'dueAt': DateTime.now()
              .add(const Duration(days: 2))
              .toIso8601String(),
        },
      ],
    };
  }

  @override
  Future<Map<String, dynamic>> post(String route, Map<String, dynamic> body) =>
      update.future;
}

class GatedIdentityApi extends DelayedApi {
  final identity = Completer<Map<String, dynamic>>();
  @override
  Future<Map<String, dynamic>> get(String route) {
    if (route == 'me') {
      reads.add(route);
      return identity.future;
    }
    return super.get(route);
  }
}

void main() {
  setUpAll(tz_data.initializeTimeZones);
  testWidgets(
    'Dashboard starts while identity is loading; no partial account is shown',
    (tester) async {
      FlutterSecureStorage.setMockInitialValues({
        'seen_onboarding_v2': 'yes',
        'session': 'test-token',
      });
      final api = GatedIdentityApi();
      await tester.pumpWidget(MaterialApp(home: Root(client: api)));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      expect(api.reads, containsAll(['me', 'dashboard']));
      expect(find.byType(ActionsPage), findsNothing);
      api.identity.complete({
        'user': {'id': 'test-user', 'name': 'Sales'},
      });
      await tester.pumpAndSettle();
      expect(find.text('Today, remembered.'), findsOneWidget);
    },
  );

  testWidgets(
    'Confirmed completion clears updating without another full dashboard read',
    (tester) async {
      FlutterSecureStorage.setMockInitialValues({
        'seen_onboarding_v2': 'yes',
        'session': 'test-token',
      });
      final api = DelayedApi();
      await tester.pumpWidget(MaterialApp(home: Root(client: api)));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Actions'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byTooltip('Mark done'));
      await tester.tap(find.byTooltip('Mark done'));
      await tester.pump();
      expect(find.text('Updating 1 action…'), findsOneWidget);
      final initialReads = api.reads.length;
      api.update.complete({'ok': true});
      await tester.pumpAndSettle();
      expect(api.reads.length, initialReads);
      expect(find.text('Updating 1 action…'), findsNothing);
      await tester.tap(find.text('Done'));
      await tester.pumpAndSettle();
      expect(find.text('Send the proposal'), findsOneWidget);
    },
  );
  testWidgets(
    'Today summary opens the matching Actions filter without a duplicate Speak button',
    (tester) async {
      FlutterSecureStorage.setMockInitialValues({
        'seen_onboarding_v2': 'yes',
        'session': 'test-token',
      });
      await tester.pumpWidget(MaterialApp(home: Root(client: DelayedApi())));
      await tester.pumpAndSettle();
      expect(find.text('Speak a follow-up'), findsNothing);
      await tester.tap(find.byKey(const ValueKey('home-summary-done')));
      await tester.pumpAndSettle();
      expect(
        tester.widget<ActionsPage>(find.byType(ActionsPage)).initialFilter,
        ActionFilter.done,
      );
    },
  );

  testWidgets('A persisted completion resumes after app restart', (
    tester,
  ) async {
    FlutterSecureStorage.setMockInitialValues({
      'seen_onboarding_v2': 'yes',
      'session': 'test-token',
      'pending_updates_test-user': '{"one":"done"}',
    });
    final api = DelayedApi();
    await tester.pumpWidget(MaterialApp(home: Root(client: api)));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.text('Updating 1 action…'), findsOneWidget);
    await tester.tap(find.text('Actions'));
    await tester.pump();
    expect(find.text('Send the proposal'), findsNothing);
    api.done = true;
    api.update.complete({'ok': true});
    await tester.pumpAndSettle();
    expect(find.text('Updating 1 action…'), findsNothing);
    await tester.tap(find.text('Done'));
    await tester.pumpAndSettle();
    expect(find.text('Send the proposal'), findsOneWidget);
  });

  for (final success in [true, false]) {
    testWidgets(
      'Completion hides immediately, survives refresh, then ${success ? 'confirms' : 'rolls back'}',
      (tester) async {
        FlutterSecureStorage.setMockInitialValues({
          'seen_onboarding_v2': 'yes',
          'session': 'test-token',
        });
        final api = DelayedApi();
        await tester.pumpWidget(MaterialApp(home: Root(client: api)));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Actions'));
        await tester.pumpAndSettle();
        expect(find.text('Send the proposal'), findsOneWidget);
        await tester.drag(find.byType(ListView).first, const Offset(0, -320));
        await tester.pumpAndSettle();
        await tester.ensureVisible(find.byTooltip('Mark done'));
        await tester.tap(find.byTooltip('Mark done'));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 100));
        expect(find.text('Send the proposal'), findsNothing);
        expect(find.text('Updating 1 action…'), findsOneWidget);
        final saved = await storage.read(key: 'pending_updates_test-user');
        expect(jsonDecode(saved!), {'one': 'done'});
        await tester.drag(find.byType(ListView).first, const Offset(0, 500));
        await tester.pump(const Duration(seconds: 1));
        expect(find.text('Send the proposal'), findsNothing);
        if (success) {
          api.done = true;
          api.update.complete({'ok': true});
        } else {
          api.update.completeError(RecallApiError('Connection failed', 0));
        }
        await tester.pumpAndSettle();
        expect(find.text('Updating 1 action…'), findsNothing);
        expect(
          find.text('Send the proposal'),
          success ? findsNothing : findsOneWidget,
        );
        expect(
          jsonDecode((await storage.read(key: 'pending_updates_test-user'))!),
          isEmpty,
        );
      },
    );
  }
}
