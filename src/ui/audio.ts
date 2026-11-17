/** Loop audio: a call chime, spoken calls, and engine rumble. */
export interface LoopAudio {
  unlock(): void;
  setMuted(muted: boolean): void;
  chime(): void;
  speak(who: string, text: string, crew: boolean): void;
  rumble(throttle: number): void;
}

export function createAudio(): LoopAudio {
  let ctx: AudioContext | null = null;
  let muted = false;
  let rumbleGain: GainNode | null = null;
  let rumbleOsc: OscillatorNode | null = null;
  let voiced = false;

  function context(): AudioContext | null {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    if (!ctx) ctx = new Ctx();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  }

  function ensureRumble(audio: AudioContext): GainNode {
    if (rumbleGain && rumbleOsc) return rumbleGain;
    const osc = audio.createOscillator();
    const filter = audio.createBiquadFilter();
    const gain = audio.createGain();
    osc.type = "sawtooth";
    osc.frequency.value = 42;
    filter.type = "lowpass";
    filter.frequency.value = 220;
    gain.gain.value = 0;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(audio.destination);
    osc.start();
    rumbleOsc = osc;
    rumbleGain = gain;
    return gain;
  }

  function unlock(): void {
    const audio = context();
    if (!audio) return;
    ensureRumble(audio);
    if (!voiced && window.speechSynthesis) {
      voiced = true;
      window.speechSynthesis.getVoices();
    }
  }

  function setMuted(next: boolean): void {
    muted = next;
    if (muted) {
      window.speechSynthesis?.cancel();
      if (rumbleGain && ctx) rumbleGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    }
  }

  function chime(): void {
    const audio = context();
    if (!audio || muted) return;
    const now = audio.currentTime;
    for (const [freq, at] of [[740, 0], [980, 0.11]] as const) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + at);
      gain.gain.exponentialRampToValueAtTime(0.16, now + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.18);
      osc.connect(gain);
      gain.connect(audio.destination);
      osc.start(now + at);
      osc.stop(now + at + 0.2);
    }
  }

  function speak(who: string, text: string, crew: boolean): void {
    if (muted || !window.speechSynthesis) return;
    const utterance = new SpeechSynthesisUtterance(`${who}. ${text}`);
    utterance.rate = 1.02;
    utterance.pitch = crew ? 1.08 : 0.92;
    utterance.volume = 1;
    const voice = window.speechSynthesis.getVoices().find((item) => item.lang.toLowerCase().startsWith("en"));
    if (voice) utterance.voice = voice;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  function rumble(throttle: number): void {
    const audio = context();
    if (!audio || !rumbleGain || !rumbleOsc) return;
    const level = muted ? 0 : Math.max(0, Math.min(1, throttle)) * 0.22;
    rumbleGain.gain.setTargetAtTime(level, audio.currentTime, 0.08);
    rumbleOsc.frequency.setTargetAtTime(36 + throttle * 28, audio.currentTime, 0.08);
  }

  return { unlock, setMuted, chime, speak, rumble };
}
