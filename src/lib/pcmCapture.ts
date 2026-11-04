const TARGET_RATE = 16_000;

function audioContext(): AudioContext {
  const Ctx =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctx) throw new Error('no-audio');
  return new Ctx();
}

function merge(chunks: Float32Array[]) {
  let length = 0;
  for (const chunk of chunks) length += chunk.length;
  const merged = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

function downsample(input: Float32Array, inRate: number, outRate: number) {
  if (outRate >= inRate) return input;
  const ratio = inRate / outRate;
  const length = Math.floor(input.length / ratio);
  const result = new Float32Array(length);
  let offset = 0;
  for (let i = 0; i < length; i += 1) {
    const next = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    let count = 0;
    for (let j = offset; j < next; j += 1) {
      sum += input[j] ?? 0;
      count += 1;
    }
    result[i] = count ? sum / count : 0;
    offset = next;
  }
  return result;
}

export function encodeWav(samples: Float32Array, sampleRate: number) {
  const pcm = downsample(samples, sampleRate, TARGET_RATE);
  const bytes = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(bytes);
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1)
      view.setUint8(offset + i, text.charCodeAt(i));
  };
  write(0, 'RIFF');
  view.setUint32(4, 36 + pcm.length * 2, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, TARGET_RATE, true);
  view.setUint32(28, TARGET_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, pcm.length * 2, true);
  let offset = 44;
  let peak = 0;
  for (let i = 0; i < pcm.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, pcm[i] ?? 0));
    peak = Math.max(peak, Math.abs(sample));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }
  return {
    blob: new Blob([bytes], { type: 'audio/wav' }),
    peak,
    seconds: pcm.length / TARGET_RATE,
  };
}

// PCM recording avoids iOS SpeechRecognition and MediaRecorder stop events.
export class PcmCapture {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private silent: GainNode | null = null;
  private chunks: Float32Array[] = [];
  private cancelled = false;
  private limitReached = false;
  get isRecording() { return !!this.stream && !this.cancelled; }
  constructor(
    private options: {
      onError: (message: string) => void;
      onLevel?: (level: number) => void;
      onLimit?: () => void;
      getContext?: () => AudioContext;
      getStream?: () => Promise<MediaStream>;
    },
  ) {}
  async start() {
    const context = this.options.getContext?.() ?? audioContext();
    this.context = context;
    // Unlock Web Audio during the original tap, before requesting the mic.
    const resumed = context.resume();
    void resumed.catch(() => {});
    try {
      const stream = await (this.options.getStream?.() ??
        navigator.mediaDevices.getUserMedia({ audio: true }));
      if (this.cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return false;
      }
      this.stream = stream;
      await resumed;
      if (this.cancelled) return false;
      this.source = context.createMediaStreamSource(stream);
      this.processor = context.createScriptProcessor(4096, 1, 1);
      this.silent = context.createGain();
      this.silent.gain.value = 0;
      let samples = 0;
      this.processor.onaudioprocess = (event) => {
        if (this.cancelled) return;
        const chunk = new Float32Array(event.inputBuffer.getChannelData(0));
        let sum = 0;
        for (const sample of chunk) sum += sample * sample;
        this.options.onLevel?.(Math.sqrt(sum / chunk.length));
        samples += chunk.length;
        if (samples / context.sampleRate > 60) {
          if (!this.limitReached) {
            this.limitReached = true;
            this.options.onLimit?.();
          }
          return;
        }
        this.chunks.push(chunk);
      };
      this.source.connect(this.processor);
      this.processor.connect(this.silent);
      this.silent.connect(context.destination);
      return true;
    } catch (error) {
      this.cancel();
      throw error;
    }
  }
  async stop(): Promise<Blob | null> {
    if (this.cancelled) return null;
    const sampleRate = this.context?.sampleRate ?? 48000;
    const samples = merge(this.chunks);
    this.cancel();
    if (samples.length < sampleRate / 4) return null;
    const result = encodeWav(samples, sampleRate);
    return result.peak < 0.005 ? null : result.blob;
  }
  cancel() {
    this.cancelled = true;
    if (this.processor) this.processor.onaudioprocess = null;
    try {
      this.source?.disconnect();
      this.processor?.disconnect();
      this.silent?.disconnect();
    } catch {}
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.context) void this.context.close().catch(() => {});
    this.context = null;
    this.chunks = [];
  }
}
export function isIosDevice(
  userAgent: string,
  platform: string,
  touches: number,
) {
  return (
    /iPad|iPhone|iPod/.test(userAgent) ||
    (platform === 'MacIntel' && touches > 1)
  );
}
