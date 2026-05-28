// Schedule musical events through Tone.js. Loaded from CDN as the global `Tone`.

const T = () => window.Tone;

let instruments = null;
let part = null;

// PolySynth voice-budget headroom. Tone.js defaults to 32, which collapses
// quickly on dense REM data (>100 events/sec with multi-second releases).
// 256 covers typical bundled datasets at reasonable durations; the play()
// function additionally shortens release times when density would still
// exceed this budget.
const POLY = 256;

function withPoly(synth) {
  synth.maxPolyphony = POLY;
  return synth.toDestination();
}

// Each preset declares how it plays:
//   percussion: true  -> pitch is ignored, fixed hit
//   percussion: false -> pitch comes from the event
//
// `factory` returns a Tone.js instance already routed to destination.
function presetFactories() {
  const Tone = T();
  return {
    string: {
      percussion: false,
      release: 1.4,
      factory: () => withPoly(new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.08, decay: 0.2, sustain: 0.6, release: 1.4 },
        volume: -10,
      })),
    },
    pad: {
      percussion: false,
      release: 3.5,
      factory: () => withPoly(new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'sine' },
        envelope: { attack: 0.6, decay: 0.4, sustain: 0.8, release: 3.5 },
        volume: -14,
      })),
    },
    pluck: {
      percussion: false,
      release: 0.4,
      factory: () => withPoly(new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.005, decay: 0.25, sustain: 0.0, release: 0.4 },
        volume: -8,
      })),
    },
    lead: {
      percussion: false,
      release: 0.3,
      factory: () => withPoly(new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'sawtooth' },
        envelope: { attack: 0.01, decay: 0.2, sustain: 0.25, release: 0.3 },
        volume: -14,
      })),
    },
    bass: {
      percussion: false,
      release: 0.25,
      factory: () => withPoly(new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'square' },
        envelope: { attack: 0.01, decay: 0.15, sustain: 0.35, release: 0.25 },
        volume: -12,
      })),
    },
    bell: {
      percussion: false,
      release: 2.5,
      factory: () => withPoly(new Tone.PolySynth(Tone.FMSynth, {
        modulationIndex: 10,
        envelope: { attack: 0.01, decay: 0.4, sustain: 0.0, release: 2.5 },
        volume: -16,
      })),
    },
    piano: {
      percussion: false,
      release: 1.0,
      factory: () => withPoly(new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 2,
        modulationIndex: 4,
        envelope: { attack: 0.005, decay: 0.6, sustain: 0.0, release: 1.0 },
        modulationEnvelope: { attack: 0.01, decay: 0.5, sustain: 0.0, release: 0.5 },
        volume: -10,
      })),
    },
    drone: {
      percussion: false,
      release: 6.0,
      factory: () => withPoly(new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'sawtooth' },
        envelope: { attack: 2.0, decay: 1.0, sustain: 0.9, release: 6.0 },
        volume: -18,
      })),
    },

    // ---- Percussion ----
    kick: {
      percussion: true,
      factory: () => new Tone.MembraneSynth({
        pitchDecay: 0.05,
        octaves: 6,
        envelope: { attack: 0.001, decay: 0.4, sustain: 0.0, release: 0.4 },
        volume: -6,
      }).toDestination(),
      hit: (inst, time, velocity) => inst.triggerAttackRelease('C2', '8n', time, velocity),
    },
    snare: {
      percussion: true,
      factory: () => new Tone.NoiseSynth({
        noise: { type: 'white' },
        envelope: { attack: 0.001, decay: 0.12, sustain: 0.0, release: 0.08 },
        volume: -14,
      }).toDestination(),
      hit: (inst, time, velocity) => inst.triggerAttackRelease('16n', time, velocity),
    },
    hat: {
      percussion: true,
      factory: () => new Tone.MetalSynth({
        frequency: 400,
        envelope: { attack: 0.001, decay: 0.05, release: 0.05 },
        harmonicity: 5.1,
        modulationIndex: 32,
        resonance: 4000,
        octaves: 1.5,
        volume: -25,
      }).toDestination(),
      hit: (inst, time, velocity) => inst.triggerAttackRelease('32n', time, velocity),
    },
    tom: {
      percussion: true,
      factory: () => new Tone.MembraneSynth({
        pitchDecay: 0.08,
        octaves: 4,
        envelope: { attack: 0.001, decay: 0.3, sustain: 0.0, release: 0.3 },
        volume: -10,
      }).toDestination(),
      hit: (inst, time, velocity) => inst.triggerAttackRelease('A2', '8n', time, velocity),
    },
    conga: {
      percussion: true,
      factory: () => new Tone.MembraneSynth({
        pitchDecay: 0.02,
        octaves: 2,
        envelope: { attack: 0.001, decay: 0.18, sustain: 0.0, release: 0.18 },
        volume: -10,
      }).toDestination(),
      hit: (inst, time, velocity) => inst.triggerAttackRelease('E3', '16n', time, velocity),
    },
    woodblock: {
      percussion: true,
      factory: () => new Tone.MetalSynth({
        frequency: 800,
        envelope: { attack: 0.001, decay: 0.04, release: 0.02 },
        harmonicity: 8.5,
        modulationIndex: 20,
        resonance: 2500,
        octaves: 0.5,
        volume: -22,
      }).toDestination(),
      hit: (inst, time, velocity) => inst.triggerAttackRelease('32n', time, velocity),
    },
  };
}

function buildInstruments(style, factories) {
  const map = {};
  for (const k of Object.keys(style.instruments)) {
    const preset = style.instruments[k].preset;
    const def = factories[preset];
    if (!def) continue;
    if (!map[preset]) {
      map[preset] = {
        instance: def.factory(),
        percussion: def.percussion,
        hit: def.hit,
        defaultRelease: def.release,
      };
    }
  }
  return map;
}

// Adapt to dense data: if the expected concurrent voice count would exceed our
// polyphony budget, shorten the release of each tonal synth so voices return
// to the pool faster. Cheap to evaluate, big audible win on dense datasets.
function adaptToDensity(instruments, musicalEvents) {
  if (musicalEvents.length < 2) return;
  const total = musicalEvents[musicalEvents.length - 1].time - musicalEvents[0].time;
  if (total <= 0) return;
  const density = musicalEvents.length / total; // events / musical second
  // We play sender + receiver per event, so voices per second ~ 2 * density.
  const voicesPerSec = density * 2;
  const budget = POLY * 0.7; // leave headroom for clustered bursts

  for (const k of Object.keys(instruments)) {
    const inst = instruments[k];
    if (inst.percussion) continue;
    const defaultRelease = inst.defaultRelease ?? 1.0;
    const expected = voicesPerSec * defaultRelease;
    if (expected <= budget) continue;
    // Scale release so voicesPerSec * release == budget.
    const newRelease = Math.max(0.05, budget / voicesPerSec);
    try { inst.instance.set({ envelope: { release: newRelease } }); } catch (e) {}
  }
}

export async function play(musicalEvents, style, onTick, onEnd) {
  const Tone = T();
  await Tone.start();
  stop();

  const factories = presetFactories();
  instruments = buildInstruments(style, factories);
  adaptToDensity(instruments, musicalEvents);
  Tone.Transport.bpm.value = style.bpm || 90;

  part = new Tone.Part((time, value) => {
    const inst = instruments[value.instrument.preset];
    if (!inst) return;

    if (inst.percussion) {
      inst.hit(inst.instance, time, value.velocity);
    } else {
      const senderNote = Tone.Frequency(value.senderPitch, 'midi').toNote();
      const receiverNote = Tone.Frequency(value.receiverPitch, 'midi').toNote();
      const notes = senderNote === receiverNote ? [senderNote] : [senderNote, receiverNote];
      inst.instance.triggerAttackRelease(notes, value.duration, time, value.velocity);
    }

    if (onTick) {
      Tone.Draw.schedule(() => onTick(value), time);
    }
  }, musicalEvents.map(e => [e.time, e]));

  part.start(0);

  const lastT = musicalEvents.length ? musicalEvents[musicalEvents.length - 1].time : 0;
  const endAt = lastT + (style.quantize > 0 ? style.quantize * 8 : 4);
  Tone.Transport.scheduleOnce((time) => {
    Tone.Draw.schedule(() => { onEnd && onEnd(); }, time);
    Tone.Transport.stop();
  }, endAt);

  Tone.Transport.start();
}

export function stop() {
  const Tone = T();
  if (!Tone) return;
  try { Tone.Transport.stop(); } catch (e) {}
  Tone.Transport.cancel();
  if (part) { try { part.dispose(); } catch (e) {} part = null; }
  if (instruments) {
    for (const k of Object.keys(instruments)) {
      try { instruments[k].instance.dispose(); } catch (e) {}
    }
    instruments = null;
  }
}
