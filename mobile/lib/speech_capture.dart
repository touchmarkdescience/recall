import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:speech_to_text/speech_to_text.dart';

abstract interface class SpeechInput {
  Future<bool> initialize({
    required void Function(String, bool) onError,
    required void Function(String) onStatus,
  });
  Future<void> listen({
    required Duration remaining,
    required void Function(String, bool) onResult,
    required void Function(double) onLevel,
  });
  Future<void> stop();
  Future<void> cancel();
}

class PhoneSpeechInput implements SpeechInput {
  final SpeechToText speech = SpeechToText();
  String? locale;
  @override
  Future<bool> initialize({
    required void Function(String, bool) onError,
    required void Function(String) onStatus,
  }) async {
    final ready = await speech.initialize(
      onError: (e) => onError(e.errorMsg, e.permanent),
      onStatus: onStatus,
    );
    if (!ready) return false;
    final locales = await speech.locales();
    locale =
        (locales
                    .where((l) => l.localeId.toLowerCase() == 'en_in')
                    .firstOrNull ??
                locales
                    .where((l) => l.localeId.toLowerCase().startsWith('en'))
                    .firstOrNull)
            ?.localeId;
    return locale != null;
  }

  @override
  Future<void> listen({
    required Duration remaining,
    required void Function(String, bool) onResult,
    required void Function(double) onLevel,
  }) => speech.listen(
    onResult: (r) => onResult(r.recognizedWords, r.finalResult),
    onSoundLevelChange: onLevel,
    listenOptions: SpeechListenOptions(
      listenFor: remaining,
      pauseFor: const Duration(seconds: 8),
      localeId: locale,
      listenMode: ListenMode.dictation,
      partialResults: true,
    ),
  );
  @override
  Future<void> stop() => speech.stop();
  @override
  Future<void> cancel() => speech.cancel();
}

List<String> _words(String text) => text
    .toLowerCase()
    .replaceAll(RegExp(r'[^\w\s]'), '')
    .split(RegExp(r'\s+'))
    .where((s) => s.isNotEmpty)
    .toList();
String _append(String before, String after) {
  if (before.isEmpty) return after;
  final a = _words(before), b = _words(after);
  // Some services repeat the end of the previous session when restarting.
  for (var n = a.length < b.length ? a.length : b.length; n >= 3; n--) {
    if (listEquals(a.sublist(a.length - n), b.sublist(0, n))) {
      after = after.split(RegExp(r'\s+')).skip(n).join(' ');
      break;
    }
  }
  return [before, after].where((s) => s.isNotEmpty).join(' ');
}

class SpeechTextBuffer {
  String committed, partial = '';
  SpeechTextBuffer(this.committed);
  String get text => _append(committed.trim(), partial.trim());
  void accept(String words) {
    words = words.trim();
    if (words.isEmpty) {
      return; // Empty/stale finals must never erase live words.
    }
    final old = _words(partial), next = _words(words);
    if (old.length > next.length &&
        listEquals(old.take(next.length).toList(), next)) {
      return;
    }
    var sharedPrefix = 0;
    while (sharedPrefix < old.length &&
        sharedPrefix < next.length &&
        old[sharedPrefix] == next[sharedPrefix]) {
      sharedPrefix++;
    }
    final sharedWords = next.where(old.contains).length;
    final shortLength = old.length < next.length ? old.length : next.length;
    if (old.length >= 5 &&
        next.isNotEmpty &&
        sharedPrefix < 2 &&
        (next.length <= 3 || sharedWords < shortLength / 2)) {
      if (next.length <= old.length &&
          listEquals(old.skip(old.length - next.length).toList(), next)) {
        return;
      }
      // Preserve a clearly new phrase even if a provider omits its boundary.
      // Ordinary cumulative revisions with substantial overlap stay replaceable.
      seal();
    }
    partial = words;
  }

  void seal() {
    committed = text;
    partial = '';
  }
}

/// One user-controlled capture window containing multiple OS speech sessions.
class SpeechCapture extends ChangeNotifier {
  final SpeechInput input;
  final void Function(String) onText;
  final void Function(double) onLevel;
  SpeechCapture({
    required this.input,
    required this.onText,
    required this.onLevel,
  });
  bool recording = false,
      starting = false,
      finishing = false,
      _disposed = false;
  int seconds = 0, _cycle = 0, _emptyCycles = 0, _run = 0;
  String? error;
  SpeechTextBuffer _text = SpeechTextBuffer('');
  Timer? _clock, _restart, _endWatchdog;
  Completer<void>? _done;
  Future<void>? _stopWork;
  bool get locked => starting || finishing;
  void _changed() {
    if (!_disposed) notifyListeners();
  }

  Future<void> start(String previous) async {
    if (_disposed || recording || locked || seconds >= 60) return;
    final run = ++_run;
    starting = true;
    error = null;
    _text = SpeechTextBuffer(previous);
    _emptyCycles = 0;
    _changed();
    try {
      final ready = await input.initialize(onError: _error, onStatus: _status);
      if (_disposed || run != _run) return;
      if (!ready) {
        error =
            'English speech recognition is unavailable. Your note is kept; you can type it.';
        return;
      }
      recording = true;
      _clock = Timer.periodic(const Duration(seconds: 1), (_) {
        seconds++;
        _changed();
        if (seconds >= 60) unawaited(stop());
      });
      await _listen();
    } catch (_) {
      error =
          'Could not start speech recognition. Your note is kept; tap the mic to retry or type it.';
      recording = false;
      _clock?.cancel();
    } finally {
      starting = false;
      _changed();
    }
  }

  Future<void> _listen() async {
    if (!recording || _disposed || seconds >= 60) return;
    _endWatchdog?.cancel();
    _text.seal();
    final cycle = ++_cycle;
    final done = Completer<void>();
    _done = done;
    var received = false;
    _receivedInCycle = () => received;
    await input.listen(
      remaining: Duration(seconds: 60 - seconds),
      onResult: (words, finalResult) {
        if (_disposed || cycle != _cycle || done.isCompleted) return;
        if (words.trim().isNotEmpty) {
          received = true;
          _emptyCycles = 0;
        }
        _text.accept(words);
        onText(_text.text);
      },
      onLevel: (level) {
        if (!_disposed && recording && cycle == _cycle) onLevel(level);
      },
    );
  }

  bool Function() _receivedInCycle = () => false;
  void _status(String status) {
    if (!_disposed &&
        status == 'notListening' &&
        _done != null &&
        !_done!.isCompleted) {
      _endWatchdog?.cancel();
      _endWatchdog = Timer(
        const Duration(milliseconds: 2200),
        () => _status('done'),
      );
      return;
    }
    if (_disposed || status != 'done' || _done == null || _done!.isCompleted) {
      return;
    }
    _endWatchdog?.cancel();
    _text.seal();
    onText(_text.text);
    _done!.complete();
    onLevel(0);
    if (!recording) return;
    if (!_receivedInCycle()) _emptyCycles++;
    if (_emptyCycles >= 3) {
      error =
          'The phone stopped recognizing speech. Your words are kept. Tap the mic to continue or type your note.';
      unawaited(stop());
      return;
    }
    _restart?.cancel();
    _restart = Timer(const Duration(milliseconds: 400), () async {
      if (!recording || _disposed) return;
      try {
        await _listen();
      } catch (_) {
        _error(
          'Could not resume speech recognition. Your words are kept.',
          true,
        );
      }
    });
  }

  void _error(String message, bool permanent) {
    if (_disposed || !recording) return;
    if (message == 'error_no_match' || message == 'error_speech_timeout') {
      _status('notListening');
      return; // done handles bounded restart.
    }
    error =
        'Speech recognition stopped. Your words are kept; tap the mic to retry or type your note.';
    unawaited(stop());
  }

  Future<void> stop() {
    if (_stopWork != null) return _stopWork!;
    if (!recording && !starting && !finishing) return Future.value();
    return _stopWork = _finish().whenComplete(() => _stopWork = null);
  }

  Future<void> _finish() async {
    if (_disposed) return;
    ++_run;
    recording = false;
    finishing = true;
    _clock?.cancel();
    _restart?.cancel();
    _changed();
    final done = _done;
    try {
      await input.stop();
      // SpeechToText.stop() returns before the final result. Its final timeout is 2s.
      if (done != null) {
        await done.future.timeout(
          const Duration(milliseconds: 2800),
          onTimeout: () {},
        );
      }
    } catch (_) {
      error ??= 'The microphone stopped. Your recognized words are kept.';
    }
    if (_disposed) return;
    _text.seal();
    onText(_text.text);
    ++_cycle;
    onLevel(0);
    finishing = false;
    _changed();
  }

  @override
  void dispose() {
    _disposed = true;
    recording = false;
    ++_cycle;
    _clock?.cancel();
    _restart?.cancel();
    _endWatchdog?.cancel();
    if (_done != null && !_done!.isCompleted) _done!.complete();
    unawaited(input.cancel().catchError((_) {}));
    super.dispose();
  }
}
