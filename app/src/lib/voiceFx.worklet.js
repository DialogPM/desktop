// Audio worklet running the voice effects (crates/voice-fx, built to WebAssembly) on the
// microphone during calls. Loaded by lib/voiceFx.ts, which passes the WebAssembly bytes in
// processorOptions; messages on the port switch the effect ({effect}), the noise reduction
// ({denoise}) or stop it ({stop}).

class VoiceFxProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const { wasm, seed, effect, denoise } = options.processorOptions;
    this.fx = new WebAssembly.Instance(new WebAssembly.Module(wasm), {}).exports;
    this.handle = this.fx.fx_new(sampleRate, seed >>> 0);
    this.ptr = this.fx.fx_buffer(this.handle);
    this.fx.fx_set_effect(this.handle, effect);
    this.fx.fx_set_denoise(this.handle, denoise ? 1 : 0);
    this.stopped = false;
    this.port.onmessage = (e) => {
      if (typeof e.data?.effect === "number") this.fx.fx_set_effect(this.handle, e.data.effect);
      if (typeof e.data?.denoise === "boolean") this.fx.fx_set_denoise(this.handle, e.data.denoise ? 1 : 0);
      if (e.data?.stop) this.stopped = true;
    };
  }

  process(inputs, outputs) {
    if (this.stopped) return false;
    const out = outputs[0];
    if (!out || out.length === 0) return true;
    const input = inputs[0] && inputs[0][0];
    if (!input) {
      for (const ch of out) ch.fill(0);
      return true;
    }
    const n = Math.min(input.length, 1024);
    // A fresh view every block: the WebAssembly memory buffer can be replaced when it grows.
    const io = new Float32Array(this.fx.memory.buffer, this.ptr, n);
    io.set(input.subarray(0, n));
    this.fx.fx_process(this.handle, n);
    for (const ch of out) ch.set(io);
    return true;
  }
}

registerProcessor("voice-fx", VoiceFxProcessor);
