// Opt-in native widget previews with sample records, never written to the server.
// flutter test --no-pub tool/render_ui_test.dart
import 'dart:io';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:timezone/data/latest.dart' as tz_data;
import 'package:recall_mobile/main.dart';
import 'package:recall_mobile/recall_ui.dart';
import 'package:recall_mobile/action_view.dart';
import 'package:timezone/timezone.dart' as tz;
import 'package:recall_mobile/recall_api.dart';

void main() {
  testWidgets('Render Recall phone previews with sample data', (tester) async {
    tz_data.initializeTimeZones();
    await tester.runAsync(() async {
      final font = FontLoader('PreviewSans');
      for (final path in [
        '/System/Library/Fonts/Supplemental/Arial.ttf',
        '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
      ]) {
        font.addFont(
          File(path).readAsBytes().then((bytes) => ByteData.sublistView(bytes)),
        );
      }
      await font.load();
      final icons = FontLoader('MaterialIcons')
        ..addFont(
          File(
            'build/unit_test_assets/fonts/MaterialIcons-Regular.otf',
          ).readAsBytes().then((bytes) => ByteData.sublistView(bytes)),
        );
      await icons.load();
    });
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    final ist = tz.getLocation('Asia/Kolkata');
    final now = tz.TZDateTime.now(ist);
    final two = tz.TZDateTime(ist, now.year, now.month, now.day, 14).toUtc();
    final four = tz.TZDateTime(
      ist,
      now.year,
      now.month,
      now.day,
      16,
      30,
    ).toUtc();
    final tomorrow = tz.TZDateTime(
      ist,
      now.year,
      now.month,
      now.day + 1,
      18,
    ).toUtc();
    final actions = [
      RecallAction({
        'id': '1',
        'title': 'Call Sujay about demo',
        'contactName': 'Sujay',
        'kind': 'follow_up',
        'status': 'pending',
        'dueAt': two.toIso8601String(),
        'createdAt': now.toIso8601String(),
      }),
      RecallAction({
        'id': '2',
        'title': 'Email Priya with proposal',
        'contactName': 'Priya',
        'kind': 'reminder',
        'status': 'pending',
        'dueAt': four.toIso8601String(),
      }),
    ];
    actions.add(
      RecallAction({
        'id': '3',
        'title': 'Discuss investor deck',
        'contactName': 'Arjun',
        'kind': 'meeting',
        'status': 'pending',
        'dueAt': tz.TZDateTime(
          ist,
          now.year,
          now.month,
          now.day,
          18,
        ).toUtc().toIso8601String(),
        'timeSpecified': true,
      }),
    );
    final pages = <String, Widget>{
      'today': Scaffold(
        body: SafeArea(
          child: HomePage(
            name: 'Bharathi',
            onAddManual: () {},
            actions: actions,
            onRefresh: () async {},
            onOpenActions: (_) {},
            onUpdate: (_, _) async {},
            onReminderSettings: () {},
          ),
        ),
        bottomNavigationBar: SafeArea(
          top: false,
          child: RecallNavigation(
            selected: 0,
            count: actions.length,
            onSelected: (_) {},
          ),
        ),
      ),
      'capture': CapturePage(
        api: RecallApi(null),
        contacts: const [],
        onSaved: () async {},
      ),
      'review': ReviewPage(
        api: RecallApi(null),
        transcript:
            'I spoke with Arjun. We’ll discuss the PPT tomorrow at 6 PM. Remind me one hour before.',
        extracted: {
          'contactName': 'Arjun',
          'summary': 'Discuss the PPT with Arjun',
          'actions': [
            {
              'kind': 'meeting',
              'title': 'Discuss the PPT',
              'dueAt': tomorrow.toIso8601String(),
              'timeSpecified': true,
              'reminderMinutes': 60,
            },
          ],
        },
        contacts: const [],
        onSaved: () async {},
      ),
      'actions': Scaffold(
        body: SafeArea(
          child: ActionsPage(
            initialFilter: ActionFilter.today,
            onAddManual: () {},
            actions: actions,
            onUpdate: (_, _) async {},
            onRefresh: () async {},
            onSettings: () {},
          ),
        ),
        bottomNavigationBar: SafeArea(
          top: false,
          child: RecallNavigation(
            selected: 3,
            count: actions.length,
            onSelected: (_) {},
          ),
        ),
      ),
    };
    pages['manual'] = ReviewPage(
      api: RecallApi(null),
      manual: true,
      transcript: '',
      extracted: {
        'contactName': '',
        'summary': '',
        'actions': [
          {
            'kind': 'follow_up',
            'title': '',
            'dueAt': null,
            'timeSpecified': false,
          },
        ],
      },
      contacts: const [],
      onSaved: () async {},
    );
    for (final entry in pages.entries) {
      final key = GlobalKey();
      await tester.pumpWidget(
        RepaintBoundary(
          key: key,
          child: MaterialApp(
            debugShowCheckedModeBanner: false,
            theme: ThemeData(
              useMaterial3: true,
              fontFamily: 'PreviewSans',
              scaffoldBackgroundColor: cream,
              colorScheme: ColorScheme.fromSeed(seedColor: ink, surface: cream),
              appBarTheme: const AppBarTheme(
                backgroundColor: cream,
                surfaceTintColor: Colors.transparent,
              ),
              inputDecorationTheme: const InputDecorationTheme(
                border: OutlineInputBorder(),
                enabledBorder: OutlineInputBorder(),
              ),
            ),
            home: entry.value,
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.runAsync(() async {
        // Allow asset decode and native raster work to finish outside fake time.
        await Future<void>.delayed(const Duration(milliseconds: 100));
      });
      await tester.pump();
      final boundary =
          key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
      await tester.runAsync(() async {
        final rendered = await boundary.toImage(pixelRatio: 2);
        final data = await rendered.toByteData(format: ui.ImageByteFormat.png);
        await Directory('build/ui-previews').create(recursive: true);
        await File(
          'build/ui-previews/${entry.key}.png',
        ).writeAsBytes(data!.buffer.asUint8List());
        rendered.dispose();
      });
    }
  });
}
