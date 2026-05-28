// Map REM events to scheduled musical events given a style preset.
//
// Mapping rules (MVP):
//   time     -> onset (compressed to style.durationSeconds, optionally quantized)
//   sender   -> pitch from the scale, in the actor's group register
//   receiver -> a second pitch played as an interval with the sender
//   type     -> instrument preset
//   weight   -> velocity
//   group    -> octave offset (A below, broker middle, B above)

function hashStr(s) {
  s = String(s);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0);
}

function groupOctaveOffset(group, spread) {
  if (group === 'A') return -12 * spread;
  if (group === 'B') return  12 * spread;
  return 0; // broker / unknown
}

export function buildMusicalEvents(rem, style) {
  const { actors, events, duration } = rem;

  // Each actor gets a stable pitch: scale degree from a hash of the id, plus
  // a group-based octave offset.
  const actorPitch = new Map();
  for (const a of actors) {
    const degree = hashStr(a.id) % style.scale.length;
    const semis = style.scale[degree];
    const octave = groupOctaveOffset(a.group, style.octaveSpread);
    actorPitch.set(String(a.id), style.rootMidi + semis + octave);
  }

  const timeScale = style.durationSeconds / Math.max(duration, 1e-6);

  const out = [];
  for (const ev of events) {
    let t = ev.time * timeScale;
    if (style.quantize > 0) {
      t = Math.round(t / style.quantize) * style.quantize;
    }

    const senderPitch = actorPitch.get(String(ev.sender));
    const receiverPitch = actorPitch.get(String(ev.receiver));
    if (senderPitch == null || receiverPitch == null) continue;

    const inst = style.instruments[ev.type] || style.instruments.default;
    const velocity = Math.min(1, 0.35 + (ev.weight || 1) * 0.12);
    const noteDuration = style.noteDuration
      ?? (style.quantize > 0 ? style.quantize * 2 : 1.8);

    out.push({
      time: t,
      senderPitch,
      receiverPitch,
      velocity,
      duration: noteDuration,
      instrument: inst,
      raw: ev,
    });
  }

  return out;
}
