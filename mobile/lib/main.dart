import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;
import 'package:flutter/services.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:intl/intl.dart';
import 'speech_capture.dart';
import 'package:timezone/timezone.dart' as tz;
import 'local_reminders.dart';
import 'recall_api.dart';
import 'action_view.dart';
import 'onboarding_art.dart';
import 'recall_ui.dart';
import 'reminder_time.dart';
import 'account_settings.dart';

const ink = Color(0xff173c34),
    mint = Color(0xffe9f4ed),
    cream = Color(0xfff9faf6),
    muted = Color(0xff82978a),
    gold = Color(0xffefb36e);
const storage = FlutterSecureStorage();
final reminders = LocalReminders();

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await reminders.initialize();
  runApp(const RecallApp());
}

class RecallApp extends StatelessWidget {
  const RecallApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'Recall',
    debugShowCheckedModeBanner: false,
    theme: ThemeData(
      useMaterial3: true,
      scaffoldBackgroundColor: cream,
      colorScheme: ColorScheme.fromSeed(seedColor: ink, surface: cream),
      appBarTheme: const AppBarTheme(
        backgroundColor: cream,
        surfaceTintColor: Colors.transparent,
        foregroundColor: ink,
        elevation: 0,
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: cream,
        showDragHandle: true,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        ),
      ),
      snackBarTheme: const SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: ink,
      ),
      textTheme: const TextTheme(
        headlineLarge: TextStyle(
          fontSize: 34,
          fontWeight: FontWeight.w800,
          color: ink,
        ),
        headlineMedium: TextStyle(
          fontSize: 27,
          fontWeight: FontWeight.w800,
          color: ink,
        ),
        titleLarge: TextStyle(
          fontSize: 20,
          fontWeight: FontWeight.w700,
          color: ink,
        ),
        bodyMedium: TextStyle(fontSize: 16, color: ink),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 16,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: const BorderSide(color: Color(0xffdce8de)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: const BorderSide(color: Color(0xffdce8de)),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: ink,
          foregroundColor: Colors.white,
          minimumSize: const Size.fromHeight(54),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(18),
          ),
        ),
      ),
    ),
    home: const Root(),
  );
}

class Root extends StatefulWidget {
  final RecallApi? client;
  const Root({super.key, this.client});
  @override
  State<Root> createState() => _RootState();
}

class _RootState extends State<Root> with WidgetsBindingObserver {
  late final RecallApi api;
  String? userId, userName;
  List<RecallAction> actions = [];
  List<RecallContact> contacts = [];
  bool loading = true, onboarding = false;
  String? startupError;
  int tab = 0;
  ActionFilter actionFilter = ActionFilter.open;
  final Map<String, String> pendingUpdates = {};
  final Set<String> inFlightUpdates = {};
  String? pendingAccount;
  Future<void> pendingWrite = Future.value();

  Future<void> persistUpdates() {
    final key = 'pending_updates_$userId';
    final value = jsonEncode(pendingUpdates);
    pendingWrite = pendingWrite
        .catchError((_) {})
        .then((_) => storage.write(key: key, value: value));
    return pendingWrite;
  }

  Future<void> sendUpdate(String id, String status) async {
    if (!inFlightUpdates.add(id)) return;
    try {
      await persistUpdates();
      await api.post('action', {'id': id, 'status': status});
      for (final action in actions.where((a) => a.id == id)) {
        action.status = status;
      }
      try {
        await load();
      } catch (_) {
        /* POST succeeded; retain confirmed status. */
      }
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Marked done.')));
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              'Could not update. The action is back on your list. $error',
            ),
          ),
        );
      }
    } finally {
      pendingUpdates.remove(id);
      inFlightUpdates.remove(id);
      await persistUpdates();
      if (mounted) {
        setState(() {});
        if (userId != null) {
          unawaited(
            reminders.sync(
              userId!,
              actions.where((a) => !pendingUpdates.containsKey(a.id)).toList(),
            ),
          );
        }
      }
    }
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    reminders.addListener(reminderChanged);
    api = widget.client ?? RecallApi(null);
    bootstrap();
  }

  void reminderChanged() {
    if (mounted) setState(() {});
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && userId != null) {
      unawaited(
        reminders.sync(
          userId!,
          actions.where((a) => !pendingUpdates.containsKey(a.id)).toList(),
        ),
      );
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    reminders.removeListener(reminderChanged);
    super.dispose();
  }

  Future<void> bootstrap() async {
    final seen = await storage.read(key: 'seen_onboarding_v2');
    final token = await storage.read(key: 'session');
    if (token == null) await reminders.clear();
    if (!mounted) return;
    if (seen != 'yes') {
      setState(() {
        onboarding = true;
        loading = false;
      });
      return;
    }
    if (token != null) {
      api.token = token;
      try {
        await load();
        return;
      } catch (error) {
        if (error is RecallApiError && error.status == 401) {
          await reminders.clear();
          await storage.delete(key: 'session');
          api.token = null;
        } else {
          if (mounted) {
            setState(() {
              startupError = '$error';
              loading = false;
            });
          }
          return;
        }
      }
    }
    if (mounted) setState(() => loading = false);
  }

  Future<void> load() async {
    final me = await api.get('me');
    final user = me['user'] as Map?;
    if (user == null) throw RecallApiError('Please sign in.', 401);
    final account = '${user['id']}';
    if (pendingAccount != account) {
      pendingUpdates.clear();
      final stored = await storage.read(key: 'pending_updates_$account');
      if (stored != null) {
        pendingUpdates.addAll(
          Map<String, String>.from(jsonDecode(stored) as Map),
        );
      }
      pendingAccount = account;
    }
    final dash = await api.get('dashboard');
    final nextActions = (dash['actions'] as List? ?? [])
        .map((v) => RecallAction(Map<String, dynamic>.from(v as Map)))
        .toList();
    final nextContacts = (dash['contacts'] as List? ?? [])
        .map((v) => RecallContact(Map<String, dynamic>.from(v as Map)))
        .toList();
    if (!mounted) return;
    setState(() {
      userId = '${user['id']}';
      userName = '${user['name']}';
      actions = nextActions;
      contacts = nextContacts;
      loading = false;
      startupError = null;
    });
    await reminders.sync(
      userId!,
      nextActions.where((a) => !pendingUpdates.containsKey(a.id)).toList(),
    );
    for (final entry in pendingUpdates.entries.toList()) {
      unawaited(sendUpdate(entry.key, entry.value));
    }
  }

  Future<void> signIn(String email, String password, {String? name}) async {
    final data = await api.post(name == null ? 'login' : 'register', {
      'email': email,
      'password': password,
      'name': ?name,
    });
    final token = data['token'] as String?;
    if (token == null) {
      throw RecallApiError(
        'Native sign-in is not enabled on this server build.',
        0,
      );
    }
    api.token = token;
    await storage.write(key: 'session', value: token);
    await load();
  }

  Future<void> signOut() async {
    if (pendingUpdates.isNotEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Your actions are still updating. Please wait before signing out.',
          ),
        ),
      );
      return;
    }
    try {
      await api.post('logout', {});
    } catch (_) {}
    await reminders.clear();
    await storage.delete(key: 'session');
    api.token = null;
    setState(() {
      userId = null;
      userName = null;
      actions = [];
      contacts = [];
      tab = 0;
    });
  }

  Future<void> deleteAccount(String password) async {
    if (pendingUpdates.isNotEmpty) {
      throw StateError(
        'Wait for your actions to finish updating before deleting your account.',
      );
    }
    await api.delete('account', {
      'password': password,
      'confirmation': 'DELETE',
    });
    await reminders.clear();
    await storage.delete(key: 'session');
    await storage.delete(key: 'pending_updates_$userId');
    api.token = null;
    pendingUpdates.clear();
    pendingAccount = null;
    if (!mounted) return;
    setState(() {
      userId = null;
      userName = null;
      actions = [];
      contacts = [];
      tab = 0;
    });
  }

  Future<void> finishOnboarding() async {
    await storage.write(key: 'seen_onboarding_v2', value: 'yes');
    setState(() {
      onboarding = false;
      loading = true;
    });
    await bootstrap();
  }

  Future<void> updateAction(RecallAction action, String status) async {
    if (pendingUpdates.containsKey(action.id)) return;
    setState(() => pendingUpdates[action.id] = status);
    unawaited(
      reminders.sync(
        userId!,
        actions.where((a) => !pendingUpdates.containsKey(a.id)).toList(),
      ),
    );
    await sendUpdate(action.id, status);
  }

  void openManual([RecallAction? action]) => Navigator.of(context).push(
    MaterialPageRoute(
      builder: (_) => ReviewPage(
        api: api,
        manual: true,
        existingAction: action,
        transcript: '',
        contacts: contacts,
        onSaved: load,
        extracted: {
          'contactName': action?.contactName ?? '',
          'summary': action?.title ?? '',
          'actions': [
            {
              'kind': action?.kind ?? 'follow_up',
              'title': action?.title ?? '',
              'dueAt': action?.dueAt?.toIso8601String(),
              'timeSpecified': action?.timeSpecified ?? false,
              'reminderMinutes': action?.reminderMinutes ?? 0,
            },
          ],
        },
      ),
    ),
  );

  void openCapture() => Navigator.of(context).push(
    MaterialPageRoute(
      builder: (_) => CapturePage(api: api, contacts: contacts, onSaved: load),
    ),
  );
  @override
  Widget build(BuildContext context) {
    if (loading) return const SplashPage();
    if (onboarding) return OnboardingPage(onDone: finishOnboarding);
    if (startupError != null) {
      return Scaffold(
        body: SafeArea(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(28),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.wifi_off_outlined, size: 58, color: ink),
                  const SizedBox(height: 20),
                  Text(
                    'Recall cannot sync yet',
                    style: Theme.of(context).textTheme.headlineMedium,
                  ),
                  const SizedBox(height: 10),
                  Text(startupError!, textAlign: TextAlign.center),
                  const SizedBox(height: 22),
                  ElevatedButton(
                    onPressed: () {
                      setState(() {
                        loading = true;
                        startupError = null;
                      });
                      bootstrap();
                    },
                    child: const Text('Retry'),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    }
    if (userId == null) return AuthPage(onSubmit: signIn);
    final visibleActions = actions
        .where((a) => !pendingUpdates.containsKey(a.id))
        .toList();
    final pages = [
      HomePage(
        name: userName ?? '',
        onAddManual: () => openManual(),
        onEdit: openManual,
        actions: visibleActions,
        onRefresh: load,
        onReminderSettings: () => setState(() => tab = 3),
        onOpenActions: (filter) => setState(() {
          actionFilter = filter;
          tab = 1;
        }),
        onUpdate: updateAction,
      ),
      ActionsPage(
        key: ValueKey(actionFilter),
        initialFilter: actionFilter,
        onAddManual: () => openManual(),
        onEdit: openManual,
        onSettings: () => setState(() => tab = 3),
        actions: visibleActions,
        onUpdate: updateAction,
        onRefresh: load,
      ),
      PeoplePage(api: api, contacts: contacts, actions: visibleActions),
      SettingsPage(
        name: userName ?? '',
        onSignOut: signOut,
        onDelete: deleteAccount,
        onNotifications: () async {
          final allowed = await reminders.requestPermission();
          if (allowed && userId != null) await reminders.sync(userId!, actions);
          return allowed;
        },
      ),
    ];
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            if (pendingUpdates.isNotEmpty)
              Container(
                color: mint,
                padding: const EdgeInsets.symmetric(
                  horizontal: 18,
                  vertical: 10,
                ),
                child: Row(
                  children: [
                    const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                    const SizedBox(width: 12),
                    Text(
                      'Updating ${pendingUpdates.length} action${pendingUpdates.length == 1 ? '' : 's'}…',
                    ),
                  ],
                ),
              ),
            if (reminders.ready &&
                actions.any((a) => a.status == 'pending') &&
                (!reminders.enabled ||
                    !reminders.exact ||
                    reminders.channelBlocked ||
                    reminders.error != null ||
                    reminders.untimedCount > 0))
              Container(
                color: const Color(0xfffff2dd),
                padding: const EdgeInsets.fromLTRB(16, 6, 8, 6),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        !reminders.enabled || reminders.channelBlocked
                            ? 'Notifications are off on this phone.'
                            : !reminders.exact
                            ? 'Precise alarms are off; reminder timing may be delayed.'
                            : reminders.error ??
                                  '${reminders.untimedCount} action${reminders.untimedCount == 1 ? ' needs' : 's need'} a reminder time.',
                        style: const TextStyle(fontSize: 12, color: ink),
                      ),
                    ),
                    TextButton(
                      onPressed: () => setState(() {
                        if (!reminders.enabled ||
                            !reminders.exact ||
                            reminders.channelBlocked ||
                            reminders.error != null) {
                          tab = 3;
                        } else {
                          actionFilter = ActionFilter.open;
                          tab = 1;
                        }
                      }),
                      child: const Text('Fix'),
                    ),
                  ],
                ),
              ),
            Expanded(child: pages[tab]),
          ],
        ),
      ),
      bottomNavigationBar: SafeArea(
        top: false,
        child: RecallNavigation(
          selected: [0, 3, 1, 4][tab],
          count: visibleActions.where((a) => a.status == 'pending').length,
          onSelected: (index) {
            if (index == 2) {
              openCapture();
              return;
            }
            setState(() => tab = {0: 0, 1: 2, 3: 1, 4: 3}[index]!);
          },
        ),
      ),
    );
  }
}

class SplashPage extends StatefulWidget {
  const SplashPage({super.key});
  @override
  State<SplashPage> createState() => _SplashPageState();
}

class _SplashPageState extends State<SplashPage>
    with SingleTickerProviderStateMixin {
  late final AnimationController pulse = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
  )..repeat(reverse: true);
  @override
  void dispose() {
    pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(22),
        child: AnimatedBuilder(
          animation: pulse,
          builder: (context, _) {
            final shade = Color.lerp(
              const Color(0xffe3ece5),
              const Color(0xfff1f5ef),
              pulse.value,
            )!;
            Widget block(double width, double height) => Container(
              width: width,
              height: height,
              decoration: BoxDecoration(
                color: shade,
                borderRadius: BorderRadius.circular(16),
              ),
            );
            return ListView(
              children: [
                Row(
                  children: [
                    Image.asset('assets/recall-icon.png', width: 44),
                    const SizedBox(width: 12),
                    const Text(
                      'Recall',
                      style: TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.bold,
                        color: ink,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 54),
                block(130, 14),
                const SizedBox(height: 18),
                block(260, 34),
                const SizedBox(height: 14),
                block(220, 18),
                const SizedBox(height: 32),
                Row(
                  children: [
                    Expanded(child: block(double.infinity, 98)),
                    const SizedBox(width: 10),
                    Expanded(child: block(double.infinity, 98)),
                    const SizedBox(width: 10),
                    Expanded(child: block(double.infinity, 98)),
                  ],
                ),
                const SizedBox(height: 28),
                block(170, 24),
                const SizedBox(height: 18),
                block(double.infinity, 122),
                const SizedBox(height: 12),
                block(double.infinity, 122),
              ],
            );
          },
        ),
      ),
    ),
  );
}

class OnboardingPage extends StatefulWidget {
  final VoidCallback onDone;
  const OnboardingPage({super.key, required this.onDone});
  @override
  State<OnboardingPage> createState() => _OnboardingPageState();
}

class _OnboardingPageState extends State<OnboardingPage> {
  int index = 0;
  final controller = PageController();
  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  final items = const [
    (
      'Speak it before you forget.',
      'After a call, say who you spoke with and what happens next. Recall turns your words into a note.',
    ),
    (
      'Know what comes next.',
      'Meetings, follow-ups, and reminders stay together. Get an alert when it matters.',
    ),
    (
      'Remember every promise.',
      'Find the last conversation, see what is pending, and arrive prepared.',
    ),
  ];
  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 18, 16, 8),
            child: Row(
              children: [
                Image.asset('assets/recall-icon.png', width: 46),
                const SizedBox(width: 12),
                const Text(
                  'Recall',
                  style: TextStyle(
                    fontSize: 29,
                    fontWeight: FontWeight.w800,
                    color: ink,
                  ),
                ),
                const Spacer(),
                if (index < 2)
                  TextButton(
                    onPressed: widget.onDone,
                    child: const Text('Skip', style: TextStyle(fontSize: 17)),
                  ),
              ],
            ),
          ),
          Expanded(
            child: PageView(
              controller: controller,
              onPageChanged: (value) => setState(() => index = value),
              children: List.generate(
                3,
                (page) => LayoutBuilder(
                  builder: (context, constraints) => SingleChildScrollView(
                    padding: const EdgeInsets.symmetric(horizontal: 24),
                    child: Column(
                      children: [
                        SizedBox(
                          height: (constraints.maxHeight * 0.58).clamp(
                            220.0,
                            370.0,
                          ),
                          width: double.infinity,
                          child: OnboardingArt(page),
                        ),
                        Text(
                          items[page].$1,
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            fontSize: 32,
                            height: 1.15,
                            fontWeight: FontWeight.w800,
                            color: ink,
                          ),
                        ),
                        const SizedBox(height: 17),
                        Text(
                          items[page].$2,
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontSize: 17,
                            height: 1.5,
                            fontStyle: page == 0
                                ? FontStyle.normal
                                : FontStyle.italic,
                            color: ink,
                          ),
                        ),
                        const SizedBox(height: 18),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 18),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(
                3,
                (page) => AnimatedContainer(
                  duration: const Duration(milliseconds: 180),
                  margin: const EdgeInsets.symmetric(horizontal: 5),
                  width: page == index ? 28 : 20,
                  height: 7,
                  decoration: BoxDecoration(
                    color: page == index ? ink : const Color(0xffd1e2d7),
                    borderRadius: BorderRadius.circular(6),
                  ),
                ),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(22, 8, 22, 22),
            child: ElevatedButton(
              onPressed: () {
                if (index == 2) {
                  widget.onDone();
                } else {
                  controller.nextPage(
                    duration: const Duration(milliseconds: 250),
                    curve: Curves.easeOut,
                  );
                }
              },
              child: Text(
                index == 2 ? 'Get started' : 'Continue',
                style: const TextStyle(
                  fontSize: 19,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          ),
        ],
      ),
    ),
  );
}

class AuthPage extends StatefulWidget {
  final Future<void> Function(String, String, {String? name}) onSubmit;
  const AuthPage({super.key, required this.onSubmit});
  @override
  State<AuthPage> createState() => _AuthPageState();
}

class _AuthPageState extends State<AuthPage> {
  final email = TextEditingController(),
      password = TextEditingController(),
      name = TextEditingController();
  bool register = false, busy = false;
  String? error;
  @override
  void dispose() {
    email.dispose();
    password.dispose();
    name.dispose();
    super.dispose();
  }

  Future<void> submit() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await widget.onSubmit(
        email.text.trim(),
        password.text,
        name: register ? name.text.trim() : null,
      );
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(28),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 40),
            Image.asset('assets/recall-icon.png', width: 70),
            const SizedBox(height: 38),
            Text(
              register ? 'Start recalling.' : 'Welcome back.',
              style: Theme.of(context).textTheme.headlineLarge,
            ),
            const SizedBox(height: 8),
            const Text(
              'A calmer way to keep every commitment.',
              style: TextStyle(fontSize: 17, color: muted),
            ),
            const SizedBox(height: 34),
            if (register) ...[
              TextField(
                controller: name,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(labelText: 'Your name'),
              ),
              const SizedBox(height: 14),
            ],
            TextField(
              controller: email,
              keyboardType: TextInputType.emailAddress,
              autocorrect: false,
              decoration: const InputDecoration(labelText: 'Email'),
            ),
            const SizedBox(height: 14),
            TextField(
              controller: password,
              obscureText: true,
              decoration: const InputDecoration(labelText: 'Password'),
            ),
            const SizedBox(height: 18),
            if (error != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 14),
                child: Text(error!, style: const TextStyle(color: Colors.red)),
              ),
            ElevatedButton(
              onPressed: busy ? null : submit,
              child: busy
                  ? const CircularProgressIndicator(color: Colors.white)
                  : Text(register ? 'Create account' : 'Sign in'),
            ),
            const SizedBox(height: 18),
            Center(
              child: TextButton(
                onPressed: () => setState(() {
                  register = !register;
                  error = null;
                }),
                child: Text(
                  register ? 'I have an account' : 'Create an account',
                ),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

String formatDue(DateTime? date) => date == null
    ? 'No due date'
    : '${DateFormat('EEE, d MMM · h:mm a').format(tz.TZDateTime.from(date, tz.getLocation('Asia/Kolkata')))} IST';

class PageHead extends StatelessWidget {
  final String eyebrow, title;
  const PageHead(this.eyebrow, this.title, {super.key});
  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        eyebrow.toUpperCase(),
        style: const TextStyle(
          letterSpacing: 2,
          color: Color(0xff67947a),
          fontWeight: FontWeight.bold,
          fontSize: 12,
        ),
      ),
      const SizedBox(height: 7),
      Text(title, style: Theme.of(context).textTheme.headlineLarge),
    ],
  );
}

String actionKindLabel(String kind) => switch (kind) {
  'meeting' => 'Meeting',
  'reminder' => 'Reminder',
  _ => 'Follow-up',
};
IconData actionIcon(String kind) => switch (kind) {
  'meeting' => Icons.calendar_today_outlined,
  'reminder' => Icons.notifications_none_rounded,
  _ => Icons.phone_outlined,
};

(Color, Color, Color) actionColors(String kind) => switch (kind) {
  'meeting' => (
    const Color(0xffeff5fb),
    const Color(0xffcaddec),
    const Color(0xff356a94),
  ),
  'reminder' => (
    const Color(0xfffff7e8),
    const Color(0xffecd8ad),
    const Color(0xff966b21),
  ),
  _ => (
    const Color(0xfff0f8f3),
    const Color(0xffcce3d4),
    const Color(0xff247355),
  ),
};

class ActionCard extends StatelessWidget {
  final ValueChanged<RecallAction>? onEdit;
  final RecallAction action;
  final bool compact;
  final Future<void> Function(RecallAction, String)? onUpdate;
  const ActionCard(
    this.action, {
    super.key,
    this.onUpdate,
    this.onEdit,
    this.compact = false,
  });
  void open(BuildContext context) => showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    builder: (sheet) => SafeArea(
      top: false,
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              actionKindLabel(action.kind),
              style: const TextStyle(color: muted, fontSize: 14),
            ),
            const SizedBox(height: 8),
            Text(
              action.title,
              style: const TextStyle(
                fontSize: 25,
                fontWeight: FontWeight.w700,
                color: ink,
              ),
            ),
            const SizedBox(height: 16),
            Text(
              action.contactName.isEmpty ? 'Guest' : action.contactName,
              style: const TextStyle(fontSize: 17, color: ink),
            ),
            const SizedBox(height: 8),
            Text(
              action.timeSpecified && action.dueAt != null
                  ? formatDue(action.dueAt)
                  : 'Reminder time required',
              style: const TextStyle(fontSize: 16, color: muted),
            ),
            const SizedBox(height: 8),
            Text(
              action.status == 'done'
                  ? 'Completed'
                  : action.status == 'archived'
                  ? 'Archived'
                  : 'Pending',
              style: const TextStyle(color: ink),
            ),
            if (action.status == 'pending' && onEdit != null) ...[
              const SizedBox(height: 18),
              OutlinedButton.icon(
                onPressed: () {
                  Navigator.pop(sheet);
                  onEdit!(action);
                },
                icon: const Icon(Icons.edit_calendar_outlined),
                label: const Text('Edit action / reminder time'),
              ),
            ],
            if (action.status == 'pending' && onUpdate != null) ...[
              const SizedBox(height: 22),
              RecallPrimaryButton(
                label: 'Mark done',
                onPressed: () {
                  Navigator.pop(sheet);
                  onUpdate!(action, 'done');
                },
              ),
            ],
          ],
        ),
      ),
    ),
  );
  @override
  Widget build(BuildContext context) {
    final timed = action.timeSpecified && action.dueAt != null;
    final overdue =
        timed &&
        action.dueAt!.isBefore(DateTime.now()) &&
        action.status == 'pending';
    final (surface, border, accent) = actionColors(action.kind);
    final at = timed
        ? tz.TZDateTime.from(action.dueAt!, tz.getLocation('Asia/Kolkata'))
        : null;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
          side: BorderSide(color: border),
        ),
        child: InkWell(
          borderRadius: BorderRadius.circular(18),
          onTap: () => open(context),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 11, 10, 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(actionIcon(action.kind), size: 15, color: accent),
                    const SizedBox(width: 6),
                    Text(
                      actionKindLabel(action.kind),
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: accent,
                      ),
                    ),
                    const SizedBox(width: 6),
                    const Text('·', style: TextStyle(color: muted)),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        action.contactName.isEmpty
                            ? 'Guest'
                            : action.contactName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 12, color: muted),
                      ),
                    ),
                    if (overdue)
                      const Text(
                        'Overdue',
                        style: TextStyle(
                          fontSize: 11,
                          color: Color(0xff9b6c27),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 7),
                Text(
                  action.title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                    height: 1.35,
                    letterSpacing: -0.1,
                    color: ink,
                  ),
                ),
                const SizedBox(height: 3),
                Row(
                  children: [
                    Expanded(
                      child: timed
                          ? Row(
                              children: [
                                const Icon(
                                  Icons.schedule,
                                  size: 14,
                                  color: muted,
                                ),
                                const SizedBox(width: 5),
                                Expanded(
                                  child: Text(
                                    '${DateFormat('d MMM · h:mm a').format(at!)} IST',
                                    style: const TextStyle(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w500,
                                      color: ink,
                                    ),
                                  ),
                                ),
                              ],
                            )
                          : action.status != 'pending'
                          ? Text(
                              action.status == 'done'
                                  ? 'Completed'
                                  : 'Archived',
                              style: const TextStyle(
                                fontSize: 12,
                                color: muted,
                              ),
                            )
                          : TextButton.icon(
                              style: TextButton.styleFrom(
                                padding: EdgeInsets.zero,
                                alignment: Alignment.centerLeft,
                              ),
                              onPressed: onEdit == null
                                  ? () => open(context)
                                  : () => onEdit!(action),
                              icon: const Icon(
                                Icons.notification_important_outlined,
                                size: 16,
                                color: Color(0xffaa7725),
                              ),
                              label: const Text(
                                'Set reminder time',
                                style: TextStyle(
                                  fontSize: 12,
                                  color: Color(0xff96691f),
                                ),
                              ),
                            ),
                    ),
                    if (action.status == 'pending' && onUpdate != null)
                      IconButton(
                        tooltip: 'Mark done',
                        onPressed: () => onUpdate!(action, 'done'),
                        style: IconButton.styleFrom(foregroundColor: accent),
                        icon: const Icon(Icons.check_circle_outline, size: 25),
                      )
                    else if (action.status == 'done')
                      Icon(Icons.check_circle_outline, color: accent, size: 22),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class HomePage extends StatelessWidget {
  final VoidCallback? onAddManual;
  final ValueChanged<RecallAction>? onEdit;
  final String name;
  final List<RecallAction> actions;
  final Future<void> Function() onRefresh;
  final ValueChanged<ActionFilter> onOpenActions;
  final VoidCallback? onReminderSettings;
  final Future<void> Function(RecallAction, String) onUpdate;
  const HomePage({
    super.key,
    required this.name,
    required this.actions,
    required this.onRefresh,
    required this.onOpenActions,
    required this.onUpdate,
    this.onReminderSettings,
    this.onAddManual,
    this.onEdit,
  });
  @override
  Widget build(BuildContext context) {
    final now = tz.TZDateTime.now(tz.getLocation('Asia/Kolkata'));
    final today =
        actions.where((a) => ActionFilter.today.matches(a, now)).toList()
          ..sort((a, b) => (a.dueAt ?? now).compareTo(b.dueAt ?? now));
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(20, 18, 20, 28),
        children: [
          RecallBrand(onNotifications: onReminderSettings),
          const SizedBox(height: 24),
          Text(
            'Good ${now.hour < 12
                ? 'morning'
                : now.hour < 17
                ? 'afternoon'
                : 'evening'}, ${name.split(' ').first}',
            style: const TextStyle(fontSize: 18, color: ink),
          ),
          const SizedBox(height: 10),
          const Text(
            'Today, remembered.',
            style: TextStyle(
              fontSize: 34,
              fontWeight: FontWeight.w800,
              letterSpacing: -1.2,
              color: ink,
              height: 1.12,
            ),
          ),
          const SizedBox(height: 22),
          Row(
            children: [
              for (final item in [
                (ActionFilter.today, mint, Icons.check_circle_outline),
                (
                  ActionFilter.overdue,
                  const Color(0xfffff2dd),
                  Icons.error_outline,
                ),
                (ActionFilter.done, mint, Icons.done_all),
              ]) ...[
                if (item.$1 != ActionFilter.today) const SizedBox(width: 8),
                Expanded(
                  child: Material(
                    color: item.$2,
                    borderRadius: BorderRadius.circular(20),
                    child: InkWell(
                      key: ValueKey('home-summary-${item.$1.name}'),
                      borderRadius: BorderRadius.circular(20),
                      onTap: () => onOpenActions(item.$1),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 15,
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Icon(item.$3, size: 18, color: ink),
                                const SizedBox(width: 7),
                                Flexible(
                                  child: FittedBox(
                                    fit: BoxFit.scaleDown,
                                    child: Text(
                                      compactCount(
                                        actions
                                            .where(
                                              (a) => item.$1.matches(a, now),
                                            )
                                            .length,
                                      ),
                                      style: const TextStyle(
                                        fontSize: 24,
                                        fontWeight: FontWeight.w800,
                                        color: ink,
                                      ),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 7),
                            Text(
                              item.$1.label,
                              style: const TextStyle(fontSize: 13, color: ink),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ],
          ),
          if (onAddManual != null)
            Align(
              alignment: Alignment.centerRight,
              child: TextButton.icon(
                onPressed: onAddManual,
                icon: const Icon(Icons.add, size: 18),
                label: const Text('Add manually'),
              ),
            ),
          const SizedBox(height: 18),
          Align(
            alignment: Alignment.centerLeft,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 7),
              decoration: BoxDecoration(
                color: const Color(0xfffff1dc),
                borderRadius: BorderRadius.circular(20),
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.calendar_today_outlined,
                    color: Color(0xffb18a38),
                    size: 19,
                  ),
                  SizedBox(width: 9),
                  Text(
                    'Due today',
                    style: TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w700,
                      color: ink,
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 14),
          if (today.isEmpty) const CaughtUpCard(),
          ...today.map(
            (a) => ActionCard(
              a,
              onUpdate: onUpdate,
              onEdit: onEdit,
              compact: true,
            ),
          ),
          if (today.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: TextButton(
                onPressed: () => onOpenActions(ActionFilter.upcoming),
                child: const Text('See upcoming commitments →'),
              ),
            ),
        ],
      ),
    );
  }
}

class CaughtUpCard extends StatelessWidget {
  const CaughtUpCard({super.key});
  @override
  Widget build(BuildContext context) => const RecallSurface(
    color: mint,
    padding: EdgeInsets.symmetric(horizontal: 22, vertical: 28),
    child: Column(
      children: [
        Icon(Icons.event_available_outlined, size: 52, color: ink),
        SizedBox(height: 16),
        Text(
          'All caught up?',
          style: TextStyle(
            fontSize: 24,
            fontWeight: FontWeight.w800,
            color: ink,
          ),
        ),
        SizedBox(height: 8),
        Text(
          'You have time to meet your next prospect.',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 16, color: muted, height: 1.4),
        ),
      ],
    ),
  );
}

class _EmptyCard extends StatelessWidget {
  final String text;
  const _EmptyCard(this.text);
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(23),
    decoration: BoxDecoration(
      color: mint,
      borderRadius: BorderRadius.circular(20),
    ),
    child: Text(text, style: const TextStyle(fontSize: 16, color: ink)),
  );
}

class ActionsPage extends StatefulWidget {
  final VoidCallback? onAddManual;
  final ValueChanged<RecallAction>? onEdit;
  final VoidCallback? onSettings;
  final ActionFilter initialFilter;
  final Future<void> Function() onRefresh;
  final List<RecallAction> actions;
  final Future<void> Function(RecallAction, String) onUpdate;
  const ActionsPage({
    super.key,
    this.initialFilter = ActionFilter.open,
    this.onSettings,
    this.onAddManual,
    this.onEdit,
    required this.actions,
    required this.onUpdate,
    required this.onRefresh,
  });
  @override
  State<ActionsPage> createState() => _ActionsPageState();
}

class _ActionsPageState extends State<ActionsPage> {
  late ActionFilter filter;
  @override
  void initState() {
    super.initState();
    filter = widget.initialFilter;
  }

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final list = widget.actions.where((a) => filter.matches(a, now)).toList()
      ..sort(
        (a, b) => (b.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0))
            .compareTo(a.createdAt ?? DateTime.fromMillisecondsSinceEpoch(0)),
      );
    return RefreshIndicator(
      onRefresh: widget.onRefresh,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(22, 24, 22, 40),
        children: [
          RecallBrand(
            onNotifications: widget.onSettings,
            onSettings: widget.onSettings,
          ),
          const SizedBox(height: 24),
          const Text(
            'Your follow-ups',
            style: TextStyle(
              fontSize: 32,
              fontWeight: FontWeight.w800,
              color: ink,
              letterSpacing: -0.8,
            ),
          ),
          const SizedBox(height: 22),
          if (widget.onAddManual != null)
            Align(
              alignment: Alignment.centerLeft,
              child: OutlinedButton.icon(
                onPressed: widget.onAddManual,
                icon: const Icon(Icons.add),
                label: const Text('Add manually'),
              ),
            ),
          const SizedBox(height: 14),
          Row(
            children: [
              for (final item in [
                ActionFilter.today,
                ActionFilter.upcoming,
                ActionFilter.done,
              ]) ...[
                if (item != ActionFilter.today) const SizedBox(width: 8),
                Expanded(
                  child: Semantics(
                    selected: item == filter,
                    button: true,
                    child: OutlinedButton(
                      style: OutlinedButton.styleFrom(
                        backgroundColor: item == filter ? ink : Colors.white,
                        foregroundColor: item == filter ? Colors.white : ink,
                        side: BorderSide(
                          color: item == filter ? ink : const Color(0xffb8cbbf),
                          width: 1.2,
                        ),
                        padding: const EdgeInsets.symmetric(
                          horizontal: 5,
                          vertical: 13,
                        ),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(16),
                        ),
                      ),
                      onPressed: () => setState(() => filter = item),
                      child: Column(
                        children: [
                          Icon(
                            item == ActionFilter.today
                                ? Icons.today_outlined
                                : item == ActionFilter.upcoming
                                ? Icons.event_outlined
                                : Icons.task_alt,
                            size: 20,
                          ),
                          const SizedBox(height: 6),
                          FittedBox(
                            fit: BoxFit.scaleDown,
                            child: Text(
                              item.label,
                              style: const TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            compactCount(
                              widget.actions
                                  .where((a) => item.matches(a, now))
                                  .length,
                            ),
                            style: TextStyle(
                              fontSize: 12,
                              color: item == filter ? Colors.white70 : muted,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            children: [
              for (final item in [
                ActionFilter.open,
                ActionFilter.overdue,
                ActionFilter.archived,
              ])
                ChoiceChip(
                  label: Text(
                    '${item.label} · ${compactCount(widget.actions.where((a) => item.matches(a, now)).length)}',
                  ),
                  selected: item == filter,
                  onSelected: (_) => setState(() => filter = item),
                ),
            ],
          ),
          const SizedBox(height: 18),
          if (list.isEmpty) const CaughtUpCard(),
          ...list.map(
            (a) =>
                ActionCard(a, onUpdate: widget.onUpdate, onEdit: widget.onEdit),
          ),
          if (widget.onSettings != null) ...[
            const SizedBox(height: 14),
            RecallDetailRow(
              icon: Icons.notifications_none_rounded,
              label: 'Reminder settings',
              value: '',
              onTap: widget.onSettings,
            ),
          ],
        ],
      ),
    );
  }
}

class PeoplePage extends StatelessWidget {
  final RecallApi api;
  final List<RecallContact> contacts;
  final List<RecallAction> actions;
  const PeoplePage({
    super.key,
    required this.api,
    required this.contacts,
    required this.actions,
  });
  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.fromLTRB(22, 24, 22, 110),
    children: [
      const PageHead('In context', 'People'),
      const SizedBox(height: 24),
      if (contacts.isEmpty)
        const _EmptyCard(
          'Names are optional. People you add will appear here.',
        ),
      for (final contact in contacts)
        Card(
          color: Colors.white,
          child: ListTile(
            minVerticalPadding: 18,
            leading: CircleAvatar(
              backgroundColor: mint,
              child: Text(
                contact.name.isEmpty ? '?' : contact.name[0].toUpperCase(),
                style: const TextStyle(color: ink),
              ),
            ),
            title: Text(contact.name),
            subtitle: Text(
              '${actions.where((action) => action.contactName == contact.name && action.status == 'pending').length} open actions',
            ),
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => PersonPage(
                  api: api,
                  contact: contact,
                  actions: actions
                      .where((action) => action.contactName == contact.name)
                      .toList(),
                ),
              ),
            ),
          ),
        ),
    ],
  );
}

class PersonPage extends StatelessWidget {
  final RecallApi api;
  final RecallContact contact;
  final List<RecallAction> actions;
  const PersonPage({
    super.key,
    required this.api,
    required this.contact,
    required this.actions,
  });
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(contact.name)),
    body: ListView(
      padding: const EdgeInsets.all(22),
      children: [
        PageHead('Person profile', contact.name),
        const SizedBox(height: 20),
        for (final state in ['pending', 'done', 'archived']) ...[
          Text(
            state == 'pending'
                ? 'To do'
                : state == 'done'
                ? 'Completed'
                : 'Archived',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 8),
          ...actions.where((a) => a.status == state).map((a) => ActionCard(a)),
          const SizedBox(height: 20),
        ],
        Text(
          'Conversation timeline',
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const SizedBox(height: 10),
        FutureBuilder<Map<String, dynamic>>(
          future: api.get('contact?id=${Uri.encodeQueryComponent(contact.id)}'),
          builder: (context, snapshot) {
            if (!snapshot.hasData) {
              return snapshot.hasError
                  ? Text(
                      '${snapshot.error}',
                      style: const TextStyle(color: muted),
                    )
                  : const _EmptyCard('Loading conversations…');
            }
            final entries = snapshot.data!['interactions'] as List? ?? [];
            if (entries.isEmpty) {
              return const _EmptyCard('No conversations yet.');
            }
            return Column(
              children: entries.map((entry) {
                final note = Map<String, dynamic>.from(entry as Map);
                final at = DateTime.tryParse('${note['occurredAt'] ?? ''}');
                return Card(
                  color: Colors.white,
                  child: ListTile(
                    title: Text('${note['summary'] ?? ''}'),
                    subtitle: Text(at == null ? '' : formatDue(at)),
                  ),
                );
              }).toList(),
            );
          },
        ),
      ],
    ),
  );
}

class SettingsPage extends StatelessWidget {
  final String name;
  final VoidCallback onSignOut;
  final Future<void> Function(String)? onDelete;
  final Future<bool> Function() onNotifications;
  const SettingsPage({
    super.key,
    required this.name,
    required this.onSignOut,
    this.onDelete,
    required this.onNotifications,
  });
  void message(BuildContext context, String text) {
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
    }
  }

  Future<void> phoneSettings(BuildContext context) async {
    if (Theme.of(context).platform == TargetPlatform.android) {
      try {
        await const MethodChannel(
          'recall/device_settings',
        ).invokeMethod<void>('notifications');
      } catch (_) {
        if (context.mounted) {
          message(
            context,
            'Open phone Settings → Apps → Recall → Notifications.',
          );
        }
      }
    } else {
      message(context, 'Open iPhone Settings → Apps → Recall → Notifications.');
    }
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: reminders,
    builder: (context, _) => ListView(
      padding: const EdgeInsets.fromLTRB(22, 24, 22, 32),
      children: [
        const PageHead('Your space', 'Settings'),
        const SizedBox(height: 24),
        RecallSurface(
          child: Row(
            children: [
              const Icon(Icons.person_outline, color: ink),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  name,
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w600,
                    color: ink,
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        RecallSurface(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Phone reminders',
                style: TextStyle(
                  fontSize: 21,
                  fontWeight: FontWeight.w700,
                  color: ink,
                ),
              ),
              const SizedBox(height: 12),
              Text(
                !reminders.ready
                    ? 'Reminder status unavailable'
                    : !reminders.enabled
                    ? 'Notifications are blocked'
                    : reminders.channelBlocked
                    ? 'The follow-up notification channel is muted'
                    : reminders.exact
                    ? 'Notifications on · precise timing allowed'
                    : 'Notifications on · timing may be delayed',
                style: TextStyle(
                  fontSize: 15,
                  color: reminders.enabled && !reminders.channelBlocked
                      ? ink
                      : const Color(0xff9b6c27),
                ),
              ),
              const SizedBox(height: 10),
              Text(
                '${reminders.scheduledCount} scheduled on this phone',
                style: const TextStyle(fontSize: 14, color: ink),
              ),
              if (reminders.nextAt != null)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: Text(
                    'Next: ${formatDue(reminders.nextAt)}',
                    style: const TextStyle(fontSize: 13, color: muted),
                  ),
                ),
              if (reminders.untimedCount > 0)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                    '${reminders.untimedCount} older actions need a specific time. Open each action and set its reminder time.',
                    style: const TextStyle(
                      fontSize: 13,
                      color: Color(0xff9b6c27),
                    ),
                  ),
                ),
              if (reminders.fallbackCount > 0)
                const Padding(
                  padding: EdgeInsets.only(top: 8),
                  child: Text(
                    'Some advance reminder times already passed; those alerts will fire at the action due time.',
                    style: TextStyle(fontSize: 13, color: muted),
                  ),
                ),
              if (reminders.error != null)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                    reminders.error!,
                    style: const TextStyle(color: Colors.red, fontSize: 13),
                  ),
                ),
              const SizedBox(height: 14),
              RecallPrimaryButton(
                label: 'Enable / check reminders',
                onPressed: () async {
                  try {
                    final allowed = await onNotifications();
                    if (context.mounted) {
                      message(
                        context,
                        allowed
                            ? 'Reminder permissions checked.'
                            : 'Enable notifications in phone settings.',
                      );
                    }
                  } catch (_) {
                    if (context.mounted) {
                      message(
                        context,
                        'Could not check permissions. Open phone settings.',
                      );
                    }
                  }
                },
              ),
              TextButton.icon(
                onPressed: () => phoneSettings(context),
                icon: const Icon(Icons.settings_outlined, size: 18),
                label: Text(
                  Theme.of(context).platform == TargetPlatform.iOS
                      ? 'How to enable in iPhone Settings'
                      : 'Open phone notification settings',
                ),
              ),
              const Divider(),
              const SizedBox(height: 8),
              const Text(
                'Test delivery',
                style: TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w700,
                  color: ink,
                ),
              ),
              const SizedBox(height: 6),
              const Text(
                'Schedule a test, close Recall, then turn off Wi-Fi and mobile data. Check that the alert arrives.',
                style: TextStyle(fontSize: 13, color: muted, height: 1.4),
              ),
              const SizedBox(height: 10),
              OutlinedButton.icon(
                onPressed: () async {
                  try {
                    final at = await reminders.testReminder();
                    if (context.mounted) {
                      message(
                        context,
                        'Test reminder scheduled: ${formatDue(at)}. Close Recall to test delivery.',
                      );
                    }
                  } catch (e) {
                    if (context.mounted) {
                      message(
                        context,
                        e is StateError
                            ? e.message
                            : 'Could not schedule the test. Check reminder permissions.',
                      );
                    }
                  }
                },
                icon: const Icon(Icons.notifications_active_outlined, size: 19),
                label: const Text('Test reminder in 1 minute'),
              ),
              if (reminders.testAt != null)
                Text(
                  'Test scheduled: ${formatDue(reminders.testAt)}',
                  style: const TextStyle(fontSize: 12, color: muted),
                ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        const RecallSurface(
          child: Row(
            children: [
              Icon(Icons.language, color: ink),
              SizedBox(width: 12),
              Expanded(
                child: Text(
                  'English speech recognition',
                  style: TextStyle(color: ink, fontSize: 15),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 18),
        OutlinedButton.icon(
          onPressed: onSignOut,
          icon: const Icon(Icons.logout),
          label: const Text('Sign out'),
        ),
        AccountSettings(onDelete: onDelete),
      ],
    ),
  );
}

class CapturePage extends StatefulWidget {
  final SpeechInput? speechInput;
  final RecallApi api;
  final List<RecallContact> contacts;
  final Future<void> Function() onSaved;
  const CapturePage({
    super.key,
    this.speechInput,
    required this.api,
    required this.contacts,
    required this.onSaved,
  });
  @override
  State<CapturePage> createState() => _CapturePageState();
}

class _CapturePageState extends State<CapturePage> with WidgetsBindingObserver {
  final note = TextEditingController();
  late final SpeechCapture capture;
  bool busy = false;
  bool get listening => capture.recording;
  int get seconds => capture.seconds;
  double level = 0;
  double minLevel = double.infinity, maxLevel = double.negativeInfinity;
  int waveTick = 0;
  String? error;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    capture = SpeechCapture(
      input: widget.speechInput ?? PhoneSpeechInput(),
      onText: (text) {
        if (!mounted) return;
        note.value = TextEditingValue(
          text: text,
          selection: TextSelection.collapsed(offset: text.length),
        );
      },
      onLevel: (value) {
        if (!mounted) return;
        setState(() {
          minLevel = math.min(minLevel, value);
          maxLevel = math.max(maxLevel, value);
          level = value == 0
              ? 0
              : maxLevel == minLevel
              ? .1
              : ((value - minLevel) / (maxLevel - minLevel)).clamp(.08, 1.0);
          waveTick++;
        });
      },
    );
    capture.addListener(captureChanged);
  }

  void captureChanged() {
    if (mounted) setState(() {});
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if ((state == AppLifecycleState.paused ||
            state == AppLifecycleState.hidden ||
            state == AppLifecycleState.detached) &&
        (listening || capture.starting)) {
      unawaited(capture.stop());
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    capture.removeListener(captureChanged);
    capture.dispose();
    note.dispose();
    super.dispose();
  }

  Future<void> toggle() async {
    if (busy || capture.locked) return;
    setState(() => error = null);
    if (listening) {
      await capture.stop();
    } else {
      await capture.start(note.text);
    }
  }

  Future<void> review() async {
    if (busy) return;
    setState(() {
      busy = true;
      error = null;
    });
    await capture.stop();
    if (!mounted) return;
    final transcript = note.text.trim();
    if (transcript.length < 3) {
      setState(() {
        error = 'Say or type a short note first.';
        busy = false;
      });
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final reference = DateTime.now();
      final extracted = await widget.api.post('extract', {
        'transcript': transcript,
      });
      if (!mounted) return;
      await Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => ReviewPage(
            api: widget.api,
            transcript: transcript,
            extracted: resolveReminderTiming(extracted, transcript, reference),
            contacts: widget.contacts,
            onSaved: widget.onSaved,
          ),
        ),
      );
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Widget waveform() => SizedBox(
    height: 56,
    child: LayoutBuilder(
      builder: (context, constraints) => Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: List.generate(37, (i) {
          final wave = listening
              ? (level * (0.35 + 0.65 * math.sin((i + waveTick) * 0.7).abs()))
                    .clamp(0.08, 1.0)
              : 0.08;
          return AnimatedContainer(
            duration: const Duration(milliseconds: 100),
            width: 3,
            height: 6 + 48 * wave,
            decoration: BoxDecoration(
              color: i % 3 == 0 ? gold : const Color(0xff7ca990),
              borderRadius: BorderRadius.circular(4),
            ),
          );
        }),
      ),
    ),
  );

  Future<void> discard() async {
    if (busy) return;
    final leave =
        note.text.trim().isEmpty ||
        await showDialog<bool>(
              context: context,
              builder: (dialog) => AlertDialog(
                title: const Text('Discard this note?'),
                content: const Text('This note has not been saved.'),
                actions: [
                  TextButton(
                    onPressed: () => Navigator.pop(dialog, false),
                    child: const Text('Keep note'),
                  ),
                  TextButton(
                    onPressed: () => Navigator.pop(dialog, true),
                    child: const Text('Discard'),
                  ),
                ],
              ),
            ) ==
            true;
    if (!leave || !mounted) return;
    if (listening || capture.locked) await capture.stop();
    if (mounted) Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const RecallBrand(centered: true), centerTitle: true),
    body: SafeArea(
      top: false,
      child: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 14),
              children: [
                const Text(
                  'New note',
                  style: TextStyle(
                    fontSize: 29,
                    fontWeight: FontWeight.w800,
                    color: ink,
                  ),
                ),
                SizedBox(
                  height: MediaQuery.viewInsetsOf(context).bottom > 0
                      ? 120
                      : 226,
                  width: double.infinity,
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      Positioned(left: 0, right: 0, child: waveform()),
                      Center(
                        child: SizedBox(
                          width: MediaQuery.viewInsetsOf(context).bottom > 0
                              ? 120
                              : 226,
                          height: MediaQuery.viewInsetsOf(context).bottom > 0
                              ? 120
                              : 226,
                          child: RecallVoiceOrb(
                            listening: listening,
                            level: level,
                            onTap: busy || capture.locked ? null : toggle,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                Center(
                  child: Text(
                    listening
                        ? 'Listening…'
                        : capture.finishing
                        ? 'Finishing your words…'
                        : seconds >= 60
                        ? 'Note captured'
                        : 'Tap the mic to speak',
                    style: const TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.w800,
                      color: ink,
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                Center(
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 18,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: mint,
                      borderRadius: BorderRadius.circular(22),
                    ),
                    child: Text(
                      '${seconds ~/ 60}:${(seconds % 60).toString().padLeft(2, '0')} / 1:00',
                      style: const TextStyle(fontSize: 16, color: ink),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                RecallSurface(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 5,
                        ),
                        decoration: BoxDecoration(
                          color: mint,
                          borderRadius: BorderRadius.circular(18),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              Icons.circle,
                              size: 8,
                              color: listening
                                  ? const Color(0xff3e9b62)
                                  : muted,
                            ),
                            const SizedBox(width: 7),
                            Text(
                              listening ? 'Live words' : 'Your words',
                              style: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                                color: ink,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 6),
                      TextField(
                        controller: note,
                        readOnly: listening || capture.locked || busy,
                        minLines: 3,
                        maxLines: 5,
                        textCapitalization: TextCapitalization.sentences,
                        style: const TextStyle(
                          fontSize: 19,
                          color: ink,
                          height: 1.4,
                        ),
                        decoration: const InputDecoration(
                          hintText: 'Speak or type your follow-up…',
                          filled: false,
                          contentPadding: EdgeInsets.symmetric(vertical: 8),
                          border: InputBorder.none,
                          enabledBorder: InputBorder.none,
                          focusedBorder: InputBorder.none,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                const RecallSurface(
                  color: mint,
                  padding: EdgeInsets.all(14),
                  child: Row(
                    children: [
                      Icon(Icons.mic_none_rounded, size: 27, color: ink),
                      SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          'Speak naturally: who, what, when, and when to remind you.',
                          style: TextStyle(
                            fontSize: 14,
                            color: ink,
                            height: 1.4,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          if (error != null || capture.error != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 6),
              child: Text(
                error ?? capture.error!,
                style: const TextStyle(color: Colors.red),
              ),
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
            child: Row(
              children: [
                Expanded(
                  flex: 3,
                  child: RecallPrimaryButton(
                    key: const ValueKey('review-details'),
                    label: listening ? 'Stop & review' : 'Review details',
                    busy: busy,
                    onPressed: busy ? null : review,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  flex: 2,
                  child: OutlinedButton(
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size.fromHeight(54),
                      side: const BorderSide(color: Color(0xff9caf9f)),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(20),
                      ),
                    ),
                    onPressed: busy ? null : discard,
                    child: const Text(
                      'Discard',
                      style: TextStyle(fontSize: 16, color: ink),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    ),
  );
}

class ReviewPage extends StatefulWidget {
  final bool manual;
  final RecallAction? existingAction;
  final RecallApi api;
  final String transcript;
  final Map<String, dynamic> extracted;
  final List<RecallContact> contacts;
  final Future<void> Function() onSaved;
  const ReviewPage({
    super.key,
    this.manual = false,
    this.existingAction,
    required this.api,
    required this.transcript,
    required this.extracted,
    required this.contacts,
    required this.onSaved,
  });
  @override
  State<ReviewPage> createState() => _ReviewPageState();
}

class _ReviewPageState extends State<ReviewPage> {
  late final TextEditingController person, summary;
  late final List<_Draft> drafts;
  String? matchedId, error;
  bool busy = false;
  final manualNotes = TextEditingController();
  late String transcriptText;
  bool needsExtraction = false;
  @override
  void initState() {
    super.initState();
    transcriptText = widget.transcript;
    person = TextEditingController(
      text: '${widget.extracted['contactName'] ?? ''}',
    );
    summary = TextEditingController(
      text: '${widget.extracted['summary'] ?? widget.transcript}',
    );
    final match = widget.extracted['matchedContactId'] as String?;
    matchedId = widget.contacts.any((c) => c.id == match) ? match : null;
    drafts = (widget.extracted['actions'] as List? ?? [])
        .map((v) => _Draft(Map<String, dynamic>.from(v as Map)))
        .toList();
  }

  @override
  void dispose() {
    manualNotes.dispose();
    person.dispose();
    summary.dispose();
    for (final a in drafts) {
      a.dispose();
    }
    super.dispose();
  }

  Future<void> pickDate(_Draft draft) async {
    final ist = tz.getLocation('Asia/Kolkata'),
        now = tz.TZDateTime.now(tz.getLocation('Asia/Kolkata'));
    final initial = draft.dueAt == null || draft.dueAt!.isBefore(now)
        ? now.add(const Duration(minutes: 5))
        : tz.TZDateTime.from(draft.dueAt!, ist);
    final day = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: now,
      lastDate: now.add(const Duration(days: 3650)),
    );
    if (day == null || !mounted) return;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(initial),
    );
    if (time == null || !mounted) return;
    final due = tz.TZDateTime(
      ist,
      day.year,
      day.month,
      day.day,
      time.hour,
      time.minute,
    ).toUtc();
    if (!due.isAfter(DateTime.now())) {
      setState(() => error = 'Choose a reminder time in the future.');
      return;
    }
    setState(() {
      draft.dueAt = due;
      draft.timeSpecified = true;
      draft.choices.clear();
      error = null;
    });
  }

  Future<T?> editor<T>(String title, Widget body, T Function() result) =>
      showModalBottomSheet<T>(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        builder: (sheet) => Padding(
          padding: EdgeInsets.only(
            bottom: MediaQuery.viewInsetsOf(sheet).bottom,
          ),
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(22, 0, 22, 22),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 23,
                    fontWeight: FontWeight.w800,
                    color: ink,
                  ),
                ),
                const SizedBox(height: 20),
                body,
                const SizedBox(height: 20),
                RecallPrimaryButton(
                  label: 'Apply changes',
                  onPressed: () => Navigator.pop(sheet, result()),
                ),
              ],
            ),
          ),
        ),
      );

  Future<void> editPerson() async {
    var id = matchedId ?? '';
    final name = TextEditingController(text: person.text);
    final result = await editor<(String, String)>(
      'Person (optional)',
      StatefulBuilder(
        builder: (sheet, update) => Column(
          children: [
            DropdownButtonFormField<String>(
              initialValue: id,
              decoration: const InputDecoration(labelText: 'Choose a person'),
              items: [
                const DropdownMenuItem(
                  value: '',
                  child: Text('Guest / create a person'),
                ),
                ...widget.contacts.map(
                  (c) => DropdownMenuItem(value: c.id, child: Text(c.name)),
                ),
              ],
              onChanged: (value) => update(() => id = value ?? ''),
            ),
            const SizedBox(height: 14),
            if (id.isEmpty)
              TextField(
                controller: name,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(
                  labelText: 'New person’s name (optional)',
                  helperText: 'Leave empty to save as Guest.',
                ),
              ),
            TextButton(
              onPressed: () {
                name.clear();
                update(() => id = '');
              },
              child: const Text('Use Guest, without a name'),
            ),
          ],
        ),
      ),
      () => (id, name.text.trim()),
    );
    if (result != null && mounted) {
      setState(() {
        matchedId = result.$1.isEmpty ? null : result.$1;
        person.text = result.$2;
      });
    }
  }

  Future<void> editAction(_Draft draft) async {
    final title = TextEditingController(text: draft.title.text);
    var kind = draft.kind;
    final result = await editor<(String, String)>(
      'Action details',
      Column(
        children: [
          TextField(
            controller: title,
            minLines: 2,
            maxLines: 4,
            textCapitalization: TextCapitalization.sentences,
            decoration: const InputDecoration(labelText: 'What needs doing?'),
          ),
          const SizedBox(height: 16),
          DropdownButtonFormField<String>(
            initialValue: kind,
            decoration: const InputDecoration(labelText: 'Type'),
            items: const [
              DropdownMenuItem(value: 'follow_up', child: Text('Follow-up')),
              DropdownMenuItem(value: 'meeting', child: Text('Meeting')),
              DropdownMenuItem(value: 'reminder', child: Text('Reminder')),
            ],
            onChanged: (value) => kind = value ?? kind,
          ),
          TextButton.icon(
            onPressed: () => Navigator.pop(context, ('', '__remove__')),
            icon: const Icon(Icons.delete_outline),
            label: const Text('Remove action'),
          ),
        ],
      ),
      () => (title.text.trim(), kind),
    );
    if (result != null && mounted) {
      setState(() {
        if (result.$2 == '__remove__') {
          drafts.remove(draft);
          draft.dispose();
        } else {
          draft.title.text = result.$1;
          draft.kind = result.$2;
        }
      });
    }
  }

  Future<void> editTranscript() async {
    final text = TextEditingController(text: transcriptText);
    final result = await editor<String>(
      'Edit transcript',
      TextField(
        controller: text,
        minLines: 4,
        maxLines: 8,
        textCapitalization: TextCapitalization.sentences,
        decoration: const InputDecoration(labelText: 'Your words'),
      ),
      () => text.text.trim(),
    );
    if (result == null || !mounted || result == transcriptText) return;
    setState(() {
      transcriptText = result;
      needsExtraction = true;
    });
    await recheckDetails();
  }

  Future<void> recheckDetails() async {
    if (transcriptText.trim().length < 3) {
      setState(() => error = 'Enter a short note before checking details.');
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final reference = DateTime.now();
      final extracted = await widget.api.post('extract', {
        'transcript': transcriptText,
      });
      final result = resolveReminderTiming(
        extracted,
        transcriptText,
        reference,
      );
      if (!mounted) return;
      setState(() {
        for (final draft in drafts) {
          draft.dispose();
        }
        drafts.clear();
        drafts.addAll(
          (result['actions'] as List? ?? []).map(
            (item) => _Draft(Map<String, dynamic>.from(item as Map)),
          ),
        );
        person.text = '${result['contactName'] ?? ''}';
        summary.text = '${result['summary'] ?? transcriptText}';
        final matched = result['matchedContactId'] as String?;
        matchedId = widget.contacts.any((contact) => contact.id == matched)
            ? matched
            : null;
        needsExtraction = false;
      });
    } catch (e) {
      if (mounted) {
        setState(
          () => error =
              'Could not recheck details. Your edited words are kept. $e',
        );
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> editReminder(_Draft draft) async {
    final value = await showModalBottomSheet<int>(
      context: context,
      builder: (sheet) => SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Padding(
              padding: EdgeInsets.only(bottom: 12),
              child: Text(
                'When to remind you',
                style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w700,
                  color: ink,
                ),
              ),
            ),
            for (final minutes in [0, 15, 30, 60, 1440])
              ListTile(
                title: Text(reminderLabel(minutes)),
                trailing: draft.reminderMinutes == minutes
                    ? const Icon(Icons.check, color: ink)
                    : null,
                onTap: () => Navigator.pop(sheet, minutes),
              ),
          ],
        ),
      ),
    );
    if (value != null && mounted) setState(() => draft.reminderMinutes = value);
  }

  String reminderLabel(int minutes) => switch (minutes) {
    0 => 'At due time',
    60 => '1 hour before',
    1440 => '1 day before',
    _ => '$minutes min before',
  };
  String reminderValue(_Draft draft) {
    final label = reminderLabel(draft.reminderMinutes);
    if (draft.dueAt == null || !draft.timeSpecified) return label;
    final at = tz.TZDateTime.from(
      draft.dueAt!.subtract(Duration(minutes: draft.reminderMinutes)),
      tz.getLocation('Asia/Kolkata'),
    );
    if (at.isBefore(DateTime.now()) && draft.dueAt!.isAfter(DateTime.now())) {
      final due = tz.TZDateTime.from(
        draft.dueAt!,
        tz.getLocation('Asia/Kolkata'),
      );
      return 'At due time · ${DateFormat('h:mm a').format(due)} (advance time passed)';
    }
    return '$label · ${DateFormat('h:mm a').format(at)}';
  }

  String get personLabel => matchedId == null
      ? (person.text.trim().isEmpty ? 'Guest' : person.text.trim())
      : widget.contacts.firstWhere((contact) => contact.id == matchedId).name;
  String get saveLabel => drafts.isEmpty
      ? 'Save note'
      : drafts.length > 1
      ? 'Save actions'
      : 'Save ${actionKindLabel(drafts.first.kind).toLowerCase()}';

  Future<void> save() async {
    if (widget.manual && drafts.isNotEmpty) {
      transcriptText = [
        drafts.first.title.text.trim(),
        manualNotes.text.trim(),
      ].where((value) => value.isNotEmpty).join('. ');
      summary.text = transcriptText;
    }
    if (needsExtraction) {
      await recheckDetails();
      return;
    }
    if (drafts.any((d) => d.title.text.trim().isEmpty)) {
      setState(() => error = 'Enter what needs doing for each action.');
      return;
    }
    if (summary.text.trim().isEmpty) {
      setState(() => error = 'Enter a short summary.');
      return;
    }
    if (drafts.any(
      (d) => d.choices.length > 1 || d.dueAt == null || !d.timeSpecified,
    )) {
      setState(
        () => error = 'Choose a date and time for every action before saving.',
      );
      return;
    }
    if (drafts.any((d) => !d.dueAt!.isAfter(DateTime.now()))) {
      setState(() => error = 'Choose a future date and time for every action.');
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    try {
      if (drafts.isNotEmpty && reminders.ready && !reminders.enabled) {
        await reminders.requestPermission();
      }
      if (widget.existingAction != null) {
        final draft = drafts.single;
        await widget.api.post('action', {
          'id': widget.existingAction!.id,
          'status': 'pending',
          'title': draft.title.text.trim(),
          'kind': draft.kind,
          'dueAt': draft.dueAt!.toIso8601String(),
          'timeSpecified': true,
          'reminderMinutes': draft.reminderMinutes,
        });
      } else {
        await widget.api.post('save', {
          'transcript': transcriptText,
          'summary': summary.text.trim(),
          'contactId': matchedId ?? '',
          'contactName': matchedId == null ? person.text.trim() : '',
          'actions': drafts
              .map(
                (d) => {
                  'kind': d.kind,
                  'title': d.title.text.trim(),
                  'dueAt': d.dueAt?.toIso8601String(),
                  'timeSpecified': d.timeSpecified,
                  'reminderMinutes': d.reminderMinutes,
                  'durationMinutes': 30,
                },
              )
              .toList(),
        });
      }
      await widget.onSaved();
      if (!mounted) return;
      Navigator.popUntil(context, (route) => route.isFirst);
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(const SnackBar(content: Text('Saved to Recall.')));
    } catch (e) {
      if (mounted) setState(() => error = '$e');
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(toolbarHeight: 48),
    body: SafeArea(
      top: false,
      child: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 18),
              children: [
                Text(
                  widget.manual
                      ? (widget.existingAction == null
                            ? 'New action'
                            : 'Edit action')
                      : 'Review note',
                  style: TextStyle(
                    fontSize: 32,
                    fontWeight: FontWeight.w800,
                    color: ink,
                    letterSpacing: -0.8,
                  ),
                ),
                const SizedBox(height: 18),
                if (widget.manual && drafts.isNotEmpty) ...[
                  TextField(
                    key: const ValueKey('manual-title'),
                    controller: drafts.first.title,
                    minLines: 2,
                    maxLines: 4,
                    textCapitalization: TextCapitalization.sentences,
                    decoration: const InputDecoration(
                      labelText: 'What needs doing?',
                      hintText:
                          'Call a client, send a document, or set a reminder',
                    ),
                  ),
                  const SizedBox(height: 14),
                  DropdownButtonFormField<String>(
                    initialValue: drafts.first.kind,
                    decoration: const InputDecoration(labelText: 'Action type'),
                    items: const [
                      DropdownMenuItem(
                        value: 'follow_up',
                        child: Text('Follow-up / callback'),
                      ),
                      DropdownMenuItem(
                        value: 'meeting',
                        child: Text('Meeting'),
                      ),
                      DropdownMenuItem(
                        value: 'reminder',
                        child: Text('Reminder'),
                      ),
                    ],
                    onChanged: busy
                        ? null
                        : (value) => setState(
                            () => drafts.first.kind = value ?? 'follow_up',
                          ),
                  ),
                  const SizedBox(height: 14),
                  if (widget.existingAction == null)
                    TextField(
                      controller: manualNotes,
                      minLines: 1,
                      maxLines: 3,
                      decoration: const InputDecoration(
                        labelText: 'Notes (optional)',
                      ),
                    ),
                  const SizedBox(height: 16),
                ] else
                  RecallSurface(
                    color: mint,
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Row(
                          children: [
                            Icon(Icons.graphic_eq, color: recallGold, size: 23),
                            SizedBox(width: 12),
                            Text(
                              'Transcript',
                              style: TextStyle(
                                fontSize: 17,
                                fontWeight: FontWeight.w700,
                                color: ink,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 14),
                        Text(
                          transcriptText,
                          maxLines: 4,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 18,
                            height: 1.4,
                            color: ink,
                          ),
                        ),
                        const SizedBox(height: 14),
                        OutlinedButton.icon(
                          onPressed: busy ? null : editTranscript,
                          icon: const Icon(Icons.edit_outlined, size: 19),
                          label: const Text('Edit text'),
                        ),
                      ],
                    ),
                  ),
                const SizedBox(height: 18),
                RecallDetailRow(
                  icon: Icons.person_outline_rounded,
                  label: 'Person',
                  subtitle: 'Optional',
                  value: personLabel,
                  onTap: busy || widget.existingAction != null
                      ? null
                      : editPerson,
                ),
                if (needsExtraction)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    child: Text(
                      'Your words changed. Recheck details before saving.',
                      style: const TextStyle(color: Color(0xff996b22)),
                    ),
                  ),
                if (drafts.isEmpty)
                  const _EmptyCard(
                    'No action was detected. Add one below or save this conversation.',
                  ),
                for (final entry in drafts.asMap().entries) ...[
                  if (drafts.length > 1)
                    Row(
                      children: [
                        Text(
                          'Action ${entry.key + 1}',
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                            color: ink,
                          ),
                        ),
                        const Spacer(),
                        IconButton(
                          tooltip: 'Remove action ${entry.key + 1}',
                          onPressed: busy
                              ? null
                              : () => setState(
                                  () => drafts.removeAt(entry.key).dispose(),
                                ),
                          icon: const Icon(Icons.close, size: 20),
                        ),
                      ],
                    ),
                  if (!widget.manual)
                    RecallDetailRow(
                      icon: Icons.task_alt,
                      label: 'Action',
                      value: entry.value.title.text.isEmpty
                          ? 'Add details'
                          : entry.value.title.text,
                      onTap: busy ? null : () => editAction(entry.value),
                    ),
                  if (entry.value.choices.length > 1)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: RecallSurface(
                        color: const Color(0xfffff3da),
                        padding: const EdgeInsets.all(14),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Two times were heard. Choose one:',
                              style: TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w700,
                                color: ink,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Wrap(
                              spacing: 8,
                              children: entry.value.choices
                                  .map(
                                    (choice) => ChoiceChip(
                                      label: Text(formatDue(choice)),
                                      selected: false,
                                      onSelected: busy
                                          ? null
                                          : (_) => setState(() {
                                              entry.value.dueAt = choice;
                                              entry.value.choices.clear();
                                              entry.value.timeSpecified = true;
                                            }),
                                    ),
                                  )
                                  .toList(),
                            ),
                          ],
                        ),
                      ),
                    ),
                  RecallDetailRow(
                    icon: Icons.calendar_today_outlined,
                    label: actionKindLabel(entry.value.kind),
                    value:
                        entry.value.dueAt == null || !entry.value.timeSpecified
                        ? 'Set reminder time'
                        : formatDue(entry.value.dueAt),
                    onTap: busy ? null : () => pickDate(entry.value),
                  ),
                  RecallDetailRow(
                    icon: Icons.notifications_none_rounded,
                    label: 'Reminder',
                    value: reminderValue(entry.value),
                    onTap: busy ? null : () => editReminder(entry.value),
                  ),
                ],
                const SizedBox(height: 12),
                const Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.info_outline, color: recallGold, size: 20),
                    SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'Check the name and timing before saving.',
                        style: TextStyle(
                          fontSize: 14,
                          color: muted,
                          height: 1.4,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                if (!widget.manual)
                  Center(
                    child: OutlinedButton.icon(
                      onPressed: busy
                          ? null
                          : () => setState(
                              () => drafts.add(
                                _Draft({
                                  'kind': 'follow_up',
                                  'title': '',
                                  'dueAt': null,
                                }),
                              ),
                            ),
                      icon: const Icon(Icons.add),
                      label: const Text('Add another action'),
                    ),
                  ),
              ],
            ),
          ),
          if (error != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
              child: Text(error!, style: const TextStyle(color: Colors.red)),
            ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
            child: RecallPrimaryButton(
              key: const ValueKey('save-note'),
              label: needsExtraction ? 'Recheck details' : saveLabel,
              busy: busy,
              onPressed: busy ? null : save,
            ),
          ),
        ],
      ),
    ),
  );
}

class _Draft {
  late final TextEditingController title;
  late String kind;
  DateTime? dueAt;
  bool timeSpecified = false;
  int reminderMinutes = 0;
  final List<DateTime> choices = [];
  _Draft(Map<String, dynamic> json) {
    title = TextEditingController(text: '${json['title'] ?? ''}');
    kind = '${json['kind'] ?? 'follow_up'}';
    dueAt = DateTime.tryParse('${json['dueAt'] ?? ''}');
    timeSpecified =
        json['timeSpecified'] == true ||
        (json['timeSpecified'] == null && dueAt != null);
    reminderMinutes = (json['reminderMinutes'] as num?)?.toInt() ?? 0;
    for (final value in json['timeChoices'] as List? ?? []) {
      final date = DateTime.tryParse('$value');
      if (date != null) choices.add(date);
    }
  }
  void dispose() => title.dispose();
}
