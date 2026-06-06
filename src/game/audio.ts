// ===== 战棋游戏音效系统 (Web Audio API - Procedural) =====

let audioContext: AudioContext | null = null;
let masterGainNode: GainNode | null = null;
let _isMuted = false;
let _volume = 0.3;

// ===== Core Audio Setup =====

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
  return audioContext;
}

function getMasterGain(): GainNode {
  const ctx = getAudioContext();
  if (!masterGainNode) {
    masterGainNode = ctx.createGain();
    masterGainNode.gain.value = _isMuted ? 0 : _volume;
    masterGainNode.connect(ctx.destination);
  }
  return masterGainNode;
}

// ===== Volume & Mute Control =====

export function setMuted(muted: boolean): void {
  _isMuted = muted;
  const gain = getMasterGain();
  gain.gain.setValueAtTime(muted ? 0 : _volume, getAudioContext().currentTime);
}

export function getMuted(): boolean {
  return _isMuted;
}

export function toggleMute(): boolean {
  setMuted(!_isMuted);
  return _isMuted;
}

/** Legacy alias used by game-store */
export function setMutedState(muted: boolean): void {
  setMuted(muted);
}

export function setSoundEnabled(enabled: boolean): void {
  if (!enabled) setMuted(true);
  else setMuted(false);
}

export function getSoundEnabled(): boolean {
  return !_isMuted;
}

export function setVolume(v: number): void {
  _volume = Math.max(0, Math.min(1, v));
  const gain = getMasterGain();
  if (!_isMuted) {
    gain.gain.setValueAtTime(_volume, getAudioContext().currentTime);
  }
}

export function getVolume(): number {
  return _volume;
}

// ===== Helper Functions =====

/**
 * Create an oscillator with ADSR envelope connected to master gain.
 * @param freq - Frequency in Hz
 * @param duration - Total duration in seconds
 * @param type - Oscillator type (default 'sine')
 * @param vol - Peak volume (0-1, applied before master gain)
 * @param attack - Attack time in seconds (default 0.01)
 * @param release - Release time in seconds (default 0.05)
 */
function createOscillator(
  freq: number,
  duration: number,
  type: OscillatorType = 'sine',
  vol: number = 0.2,
  attack: number = 0.01,
  release: number = 0.05,
): { osc: OscillatorNode; gain: GainNode } {
  const ctx = getAudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime);

  const now = ctx.currentTime;
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(vol, now + attack);
  gain.gain.setValueAtTime(vol, now + duration - release);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  osc.connect(gain);
  gain.connect(getMasterGain());

  osc.start(now);
  osc.stop(now + duration);

  return { osc, gain };
}

/**
 * Create a white noise buffer for use in noise-based sounds.
 * @param duration - Duration in seconds
 */
function createNoiseBuffer(duration: number): AudioBuffer {
  const ctx = getAudioContext();
  const sampleRate = ctx.sampleRate;
  const bufferSize = Math.max(1, Math.ceil(sampleRate * duration));
  const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

/**
 * Play filtered noise with optional bandpass filter.
 * @param duration - Duration in seconds
 * @param filterFreq - Bandpass filter frequency in Hz (default 1000)
 * @param vol - Volume (0-1, default 0.2)
 * @param attack - Attack time in seconds
 * @param release - Release time in seconds
 */
function playNoise(
  duration: number,
  filterFreq: number = 1000,
  vol: number = 0.2,
  attack: number = 0.01,
  release: number = 0.05,
): void {
  const ctx = getAudioContext();
  const buffer = createNoiseBuffer(duration);
  const source = ctx.createBufferSource();
  source.buffer = buffer;

  // Bandpass filter for shaping
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(filterFreq, ctx.currentTime);
  filter.Q.setValueAtTime(1, ctx.currentTime);

  // Envelope
  const gain = ctx.createGain();
  const now = ctx.currentTime;
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(vol, now + attack);
  gain.gain.setValueAtTime(vol, now + duration - release);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(getMasterGain());

  source.start(now);
}

/**
 * Play a tone with ADSR envelope (shorthand for createOscillator).
 * @param freq - Frequency in Hz
 * @param duration - Duration in seconds
 * @param type - Oscillator type (default 'sine')
 * @param vol - Volume (0-1, default 0.2)
 * @param attack - Attack time in seconds (default 0.01)
 * @param release - Release time in seconds (default 0.05)
 */
function playTone(
  freq: number,
  duration: number,
  type: OscillatorType = 'sine',
  vol: number = 0.2,
  attack: number = 0.01,
  release: number = 0.05,
): void {
  createOscillator(freq, duration, type, vol, attack, release);
}

// ===== Sound Effects =====

/** 1. Short click — high-freq sine wave, 50ms, 800Hz */
export function playClickSound(): void {
  playTone(800, 0.05, 'sine', 0.15, 0.005, 0.02);
}

/** 2. Unit selection — ascending two-tone, 100ms, 400→600Hz */
export function playSelectSound(): void {
  playTone(400, 0.08, 'sine', 0.15, 0.005, 0.02);
  setTimeout(() => playTone(600, 0.1, 'sine', 0.12, 0.005, 0.03), 60);
}

/** 3. Unit movement — short whoosh: filtered noise, 200ms */
export function playMoveSound(): void {
  playNoise(0.2, 2000, 0.15, 0.01, 0.08);
  playTone(200, 0.08, 'square', 0.08, 0.005, 0.03);
  setTimeout(() => playTone(250, 0.06, 'square', 0.06, 0.005, 0.02), 40);
}

/** 4. Attack/explosion — low-frequency boom: 300ms, noise + sine 100Hz */
export function playAttackSound(): void {
  playNoise(0.3, 400, 0.3, 0.005, 0.1);
  playTone(100, 0.25, 'sawtooth', 0.25, 0.005, 0.1);
  setTimeout(() => playNoise(0.15, 600, 0.15, 0.005, 0.05), 80);
}

/** 5. Hit impact — metallic ping: 150ms, sine 1200Hz + noise */
export function playHitSound(): void {
  playTone(1200, 0.08, 'sine', 0.2, 0.002, 0.03);
  playNoise(0.1, 3000, 0.12, 0.002, 0.04);
  playTone(400, 0.1, 'sawtooth', 0.12, 0.005, 0.04);
  setTimeout(() => playTone(200, 0.12, 'sine', 0.08, 0.005, 0.05), 40);
}

/** 6. Unit destroyed — dramatic descending tone, 500ms */
export function playKillSound(): void {
  playNoise(0.5, 300, 0.35, 0.005, 0.15);
  playTone(400, 0.5, 'sawtooth', 0.2, 0.01, 0.2);
  // Descending pitch
  const ctx = getAudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(500, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.5);
  gain.gain.setValueAtTime(0.001, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
  osc.connect(gain);
  gain.connect(getMasterGain());
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.5);
  setTimeout(() => playTone(60, 0.3, 'sine', 0.12, 0.005, 0.1), 200);
}

/** 7. Turn start — triumphant ascending chord, 300ms */
export function playTurnStartSound(): void {
  playTone(440, 0.15, 'sine', 0.15, 0.01, 0.04);  // A4
  setTimeout(() => playTone(554, 0.2, 'sine', 0.18, 0.01, 0.05), 80);  // C#5
  setTimeout(() => playTone(659, 0.25, 'sine', 0.2, 0.01, 0.06), 160); // E5
}

/** 8. Turn end — soft descending tone, 200ms */
export function playTurnEndSound(): void {
  playTone(554, 0.12, 'sine', 0.12, 0.01, 0.04);  // C#5
  setTimeout(() => playTone(440, 0.15, 'sine', 0.1, 0.01, 0.05), 80); // A4
}

/** 9. Build fortification — construction noise: 400ms, filtered noise */
export function playFortifySound(): void {
  playNoise(0.15, 800, 0.15, 0.005, 0.03);
  playTone(300, 0.08, 'square', 0.12, 0.005, 0.02);
  setTimeout(() => {
    playNoise(0.12, 1000, 0.12, 0.005, 0.03);
    playTone(400, 0.08, 'square', 0.12, 0.005, 0.02);
  }, 80);
  setTimeout(() => {
    playNoise(0.1, 1200, 0.1, 0.005, 0.03);
    playTone(500, 0.08, 'square', 0.12, 0.005, 0.02);
  }, 160);
  setTimeout(() => playTone(600, 0.12, 'sine', 0.15, 0.01, 0.04), 220);
}

/** 10. Capture point taken — victory fanfare: ascending triad, 400ms */
export function playCaptureSound(): void {
  playTone(523, 0.15, 'sine', 0.18, 0.01, 0.04);  // C5
  setTimeout(() => playTone(659, 0.15, 'sine', 0.18, 0.01, 0.04), 120); // E5
  setTimeout(() => playTone(784, 0.15, 'sine', 0.2, 0.01, 0.04), 240);  // G5
  setTimeout(() => playTone(1047, 0.3, 'sine', 0.22, 0.01, 0.08), 360); // C6
}

/** 11. Healing — gentle rising tone, 300ms, sine 500→700Hz */
export function playHealSound(): void {
  const ctx = getAudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(500, ctx.currentTime);
  osc.frequency.linearRampToValueAtTime(700, ctx.currentTime + 0.3);
  gain.gain.setValueAtTime(0.001, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.05);
  gain.gain.setValueAtTime(0.15, ctx.currentTime + 0.2);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
  osc.connect(gain);
  gain.connect(getMasterGain());
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.3);
}

/** 12. Mine explosion — sharp crack + rumble, 300ms */
export function playMineExplosionSound(): void {
  // Sharp crack (high-freq noise burst)
  playNoise(0.08, 4000, 0.35, 0.001, 0.04);
  playTone(200, 0.05, 'square', 0.2, 0.001, 0.02);
  // Rumble
  setTimeout(() => {
    playNoise(0.25, 150, 0.25, 0.005, 0.12);
    playTone(80, 0.2, 'sawtooth', 0.2, 0.01, 0.1);
  }, 60);
}

/** 13. Enter stealth — mysterious whisper: filtered noise, 300ms */
export function playStealthSound(): void {
  // Low-pass filtered noise for whisper effect
  const ctx = getAudioContext();
  const buffer = createNoiseBuffer(0.3);
  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(800, ctx.currentTime);
  filter.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.3);
  filter.Q.setValueAtTime(2, ctx.currentTime);

  const gain = ctx.createGain();
  const now = ctx.currentTime;
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.linearRampToValueAtTime(0.15, now + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(getMasterGain());
  source.start(now);

  // Subtle descending tone
  playTone(440, 0.15, 'sine', 0.08, 0.01, 0.06);
  setTimeout(() => playTone(330, 0.15, 'sine', 0.06, 0.01, 0.06), 80);
  setTimeout(() => playTone(220, 0.2, 'sine', 0.04, 0.01, 0.08), 160);
}

/** 14. Unit retreat — descending tone, 200ms */
export function playRetreatSound(): void {
  playTone(500, 0.1, 'sine', 0.12, 0.005, 0.03);
  setTimeout(() => playTone(350, 0.12, 'sine', 0.1, 0.005, 0.04), 70);
}

/** 15. Game over — dramatic minor chord, 800ms */
export function playGameOverSound(isVictory: boolean = false): void {
  if (isVictory) {
    // Victory version - bright major chord
    playVictorySound();
    return;
  }
  // Defeat - dramatic minor chord (A minor)
  playTone(440, 0.4, 'sine', 0.2, 0.02, 0.1);   // A4
  playTone(523, 0.4, 'sine', 0.15, 0.02, 0.1);   // C5
  playTone(659, 0.4, 'sine', 0.12, 0.02, 0.1);   // E5
  setTimeout(() => playTone(330, 0.5, 'sine', 0.15, 0.02, 0.15), 350); // E4
  setTimeout(() => playTone(220, 0.6, 'sine', 0.1, 0.02, 0.2), 600);   // A3
}

/** 16. Victory — major chord fanfare, 600ms */
export function playVictorySound(): void {
  playTone(523, 0.2, 'sine', 0.2, 0.01, 0.05);   // C5
  playTone(659, 0.2, 'sine', 0.18, 0.01, 0.05);  // E5
  playTone(784, 0.2, 'sine', 0.15, 0.01, 0.05);  // G5
  setTimeout(() => {
    playTone(523, 0.15, 'sine', 0.18, 0.01, 0.04);
    playTone(659, 0.15, 'sine', 0.16, 0.01, 0.04);
    playTone(784, 0.15, 'sine', 0.14, 0.01, 0.04);
    playTone(1047, 0.4, 'sine', 0.22, 0.01, 0.1); // C6
  }, 200);
}

/** 17. Weather change — ambient whoosh, 500ms */
export function playWeatherChangeSound(): void {
  playNoise(0.5, 500, 0.2, 0.05, 0.15);
  // Secondary sweep
  const ctx = getAudioContext();
  const buffer = createNoiseBuffer(0.4);
  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(200, ctx.currentTime + 0.1);
  filter.frequency.exponentialRampToValueAtTime(2000, ctx.currentTime + 0.35);
  filter.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.5);
  filter.Q.setValueAtTime(0.5, ctx.currentTime);

  const gain = ctx.createGain();
  const now = ctx.currentTime;
  gain.gain.setValueAtTime(0.001, now + 0.1);
  gain.gain.linearRampToValueAtTime(0.12, now + 0.2);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(getMasterGain());
  source.start(now + 0.1);
}

/** 18. Save game — confirmation beep, 150ms */
export function playSaveSound(): void {
  playTone(880, 0.08, 'sine', 0.15, 0.005, 0.02);
  setTimeout(() => playTone(1100, 0.1, 'sine', 0.12, 0.005, 0.03), 60);
}

/** 19. Error/invalid action — low buzzer, 200ms */
export function playErrorSound(): void {
  playTone(150, 0.15, 'square', 0.12, 0.005, 0.05);
  setTimeout(() => playTone(120, 0.15, 'square', 0.1, 0.005, 0.05), 100);
}

/** 20. Deploy unit — placement thunk, 200ms */
export function playDeploySound(): void {
  playNoise(0.08, 1500, 0.12, 0.002, 0.03);
  playTone(500, 0.1, 'sine', 0.15, 0.005, 0.03);
  setTimeout(() => {
    playNoise(0.06, 1800, 0.08, 0.002, 0.02);
    playTone(700, 0.12, 'sine', 0.12, 0.005, 0.04);
  }, 70);
}

// ===== Additional Game Sounds (retained from original) =====

/** Level up — ascending arpeggio */
export function playLevelUpSound(): void {
  playTone(523, 0.12, 'sine', 0.2, 0.005, 0.03);  // C5
  setTimeout(() => playTone(659, 0.12, 'sine', 0.2, 0.005, 0.03), 80);  // E5
  setTimeout(() => playTone(784, 0.12, 'sine', 0.2, 0.005, 0.03), 160); // G5
  setTimeout(() => playTone(1047, 0.3, 'sine', 0.25, 0.01, 0.08), 240); // C6
}

/** Cancel action — soft descending tones */
export function playCancelSound(): void {
  playTone(300, 0.08, 'sine', 0.1, 0.005, 0.03);
  setTimeout(() => playTone(250, 0.1, 'sine', 0.08, 0.005, 0.04), 50);
}

/** HE splash — artillery barrage */
export function playSplashSound(): void {
  playNoise(0.2, 300, 0.2, 0.005, 0.06);
  playTone(120, 0.15, 'sawtooth', 0.15, 0.005, 0.05);
  setTimeout(() => playNoise(0.1, 500, 0.12, 0.005, 0.04), 60);
}

/** Enter stealth (original) — low fade */
export function playStealthEnterSound(): void {
  playStealthSound();
}

/** Exit stealth — alert burst */
export function playStealthExitSound(): void {
  playTone(600, 0.06, 'square', 0.12, 0.005, 0.02);
  setTimeout(() => playTone(800, 0.06, 'square', 0.12, 0.005, 0.02), 50);
  setTimeout(() => playTone(1000, 0.08, 'square', 0.08, 0.005, 0.03), 100);
}

/** Hero ability activation — power charging surge, 400ms */
export function playHeroAbilitySound(): void {
  // Deep power-up sweep
  const ctx = getAudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(200, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.25);
  gain.gain.setValueAtTime(0.001, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.05);
  gain.gain.setValueAtTime(0.2, ctx.currentTime + 0.2);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
  osc.connect(gain);
  gain.connect(getMasterGain());
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.4);

  // Metallic shimmer on top
  setTimeout(() => playTone(1200, 0.15, 'sine', 0.12, 0.005, 0.06), 100);
  setTimeout(() => playTone(1600, 0.12, 'sine', 0.1, 0.005, 0.05), 180);

  // Impact hit
  setTimeout(() => {
    playNoise(0.1, 2000, 0.18, 0.002, 0.04);
    playTone(300, 0.12, 'square', 0.15, 0.005, 0.04);
  }, 250);
}

/** Counter attack — quick metallic burst */
export function playCounterAttackSound(): void {
  playTone(600, 0.04, 'square', 0.12, 0.002, 0.015);
  playNoise(0.12, 2500, 0.15, 0.002, 0.04);
  setTimeout(() => playTone(300, 0.08, 'sawtooth', 0.08, 0.005, 0.03), 40);
}
