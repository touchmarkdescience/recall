import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:recall_mobile/speech_capture.dart';

class FakeSpeech implements SpeechInput {
  late void Function(String) status;
  late void Function(String, bool) error;
  final results = <void Function(String, bool)>[];
  int listens = 0, stops = 0;
  @override
  Future<bool> initialize({
    required void Function(String, bool) onError,
    required void Function(String) onStatus,
  }) async {
    status = onStatus;
    error = onError;
    return true;
  }

  @override
  Future<void> listen({
    required Duration remaining,
    required void Function(String, bool) onResult,
    required void Function(double) onLevel,
  }) async {
    listens++;
    results.add(onResult);
  }

  @override
  Future<void> stop() async {
    stops++;
  }

  @override
  Future<void> cancel() async {}
  void words(String text, {bool finalResult = false}) =>
      results.last(text, finalResult);
}

void main() {
  test('A reset or empty callback cannot erase previously displayed words', () {
    final b = SpeechTextBuffer('');
    b.accept('I just spoke with Anand about the proposal document');
    b.accept('');
    expect(b.text, 'I just spoke with Anand about the proposal document');
    b.accept('hotel');
    expect(b.text, 'I just spoke with Anand about the proposal document hotel');
    b.accept('hotel meeting');
    expect(
      b.text,
      'I just spoke with Anand about the proposal document hotel meeting',
    );
  });
  test(
    'Non-cumulative longer phrases preserve earlier speech; ordinary revisions still replace',
    () {
      final b = SpeechTextBuffer('');
      b.accept('I spoke to Anand about the proposal document');
      b.accept('I need a reminder tonight at six');
      expect(
        b.text,
        'I spoke to Anand about the proposal document I need a reminder tonight at six',
      );
      final revised = SpeechTextBuffer('');
      revised.accept('I spoke to Anant about the proposal document');
      revised.accept('I spoke to Anand about the proposal document');
      expect(revised.text, 'I spoke to Anand about the proposal document');
    },
  );
  testWidgets(
    '24 seconds across native sessions retains all words and the final reminder on stop',
    (tester) async {
      final engine = FakeSpeech();
      var text = '';
      final capture = SpeechCapture(
        input: engine,
        onText: (s) => text = s,
        onLevel: (_) {},
      );
      await capture.start('');
      engine.words('today I met Anand from SS TPL');
      engine.words('today I met Anand from SS TPL', finalResult: true);
      engine.status('done');
      engine.status('done');
      await tester.pump(const Duration(milliseconds: 450));
      expect(engine.listens, 2);
      await tester.pump(const Duration(seconds: 10));
      engine.words(
        'he wanted me to call him tomorrow with the proposal document',
      );
      engine.status('done');
      await tester.pump(const Duration(milliseconds: 450));
      expect(engine.listens, 3);
      await tester.pump(const Duration(seconds: 13));
      engine.words('so remind me tonight');
      var finished = false;
      unawaited(capture.stop().then((_) => finished = true));
      await tester.pump();
      expect(finished, false);
      engine.words('so remind me tonight 6:00 p.m.', finalResult: true);
      engine.status('done');
      await tester.pump();
      expect(finished, true);
      expect(
        text,
        'today I met Anand from SS TPL he wanted me to call him tomorrow with the proposal document so remind me tonight 6:00 p.m.',
      );
      engine.results.first('old result', true);
      engine.words('', finalResult: true);
      engine.status('done');
      await tester.pump(const Duration(seconds: 1));
      expect(engine.listens, 3);
      expect(text, contains('tonight 6:00 p.m.'));
      capture.dispose();
    },
  );
  testWidgets(
    'Manual stop, restart and duplicate finals append without duplication',
    (tester) async {
      final e = FakeSpeech();
      var text = '';
      final c = SpeechCapture(
        input: e,
        onText: (s) => text = s,
        onLevel: (_) {},
      );
      await c.start('Earlier note.');
      e.words('Call Arjun tomorrow', finalResult: true);
      e.status('done');
      await c.stop();
      await c.start(text);
      e.words('Send the proposal');
      final stop = c.stop();
      e.words('Send the proposal', finalResult: true);
      e.status('done');
      await stop;
      expect(text, 'Earlier note. Call Arjun tomorrow Send the proposal');
      await tester.pump(const Duration(seconds: 1));
      expect(e.listens, 2);
      c.dispose();
    },
  );
  testWidgets(
    'Stop without native final preserves partials after the bounded wait',
    (tester) async {
      final e = FakeSpeech();
      var text = '';
      final c = SpeechCapture(
        input: e,
        onText: (s) => text = s,
        onLevel: (_) {},
      );
      await c.start('Typed first.');
      e.words('Call Anand tomorrow');
      final done = c.stop();
      await tester.pump();
      await tester.pump(const Duration(seconds: 3));
      await done;
      expect(text, 'Typed first. Call Anand tomorrow');
      c.dispose();
    },
  );
  testWidgets('The capture limit stops at 60 seconds', (tester) async {
    final e = FakeSpeech();
    var text = '';
    final c = SpeechCapture(input: e, onText: (s) => text = s, onLevel: (_) {});
    await c.start('');
    e.words('Call Sujay tomorrow');
    await tester.pump(const Duration(seconds: 60));
    expect(c.recording, false);
    expect(c.seconds, 60);
    expect(e.stops, 1);
    e.status('done');
    await tester.pump();
    expect(text, 'Call Sujay tomorrow');
    await tester.pump(const Duration(seconds: 1));
    expect(e.listens, 1);
    c.dispose();
  });
  testWidgets(
    'Permanent errors retain words and never restart the microphone',
    (tester) async {
      final e = FakeSpeech();
      var text = '';
      final c = SpeechCapture(
        input: e,
        onText: (s) => text = s,
        onLevel: (_) {},
      );
      await c.start('');
      e.words('Keep this note');
      e.error('error_audio', true);
      e.status('done');
      await tester.pump(const Duration(seconds: 1));
      expect(c.recording, false);
      expect(c.error, isNotNull);
      expect(text, 'Keep this note');
      expect(e.listens, 1);
      c.dispose();
    },
  );
  testWidgets(
    'A provider that omits done can resume without losing its partial',
    (tester) async {
      final e = FakeSpeech();
      var text = '';
      final c = SpeechCapture(
        input: e,
        onText: (s) => text = s,
        onLevel: (_) {},
      );
      await c.start('');
      e.words('Call Anand tomorrow with the proposal');
      e.status('notListening');
      await tester.pump(const Duration(milliseconds: 2300));
      await tester.pump(const Duration(milliseconds: 450));
      expect(e.listens, 2);
      e.words('remind me tonight at 6 PM');
      final stopped = c.stop();
      e.status('done');
      await stopped;
      expect(
        text,
        'Call Anand tomorrow with the proposal remind me tonight at 6 PM',
      );
      c.dispose();
    },
  );
  test(
    'Reviewing a typed note does not replace it with an empty speech buffer',
    () async {
      final c = SpeechCapture(
        input: FakeSpeech(),
        onText: (_) => fail('Typed note must not be overwritten'),
        onLevel: (_) {},
      );
      await c.stop();
      c.dispose();
    },
  );
}
