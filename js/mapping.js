// Map REM events to scheduled musical events given a style preset.
//
// Mapping rules (MVP):
//   time     -> onset (compressed to style.durationSeconds, optionally quantized)
//   sender   -> pitch from the scale, in the actor's group register
//   receiver -> a second pitch played as an interval with the sender
//   type     -> instrument preset (falls back to style.instruments.default)
//   weight   -> velocity
//   group    -> octave offset (groups spread evenly across +/- style.octaveSpread * 12 semitones)

function hashStr(s) {
  s = String(s);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0);
}

// Build an octave offset table: each unique group gets an integer semitone
// offset, with the set spread evenly across +/- (spread * 12) semitones.
function buildGroupOffsets(actors, spread) {
  const groups = [...new Set(actors.map(a => a.group ?? 'default'))].sort();
  const offsets = new Map();
  if (groups.length <= 1) {
    offsets.set(groups[0] ?? 'default', 0);
    return offsets;
  }
  const total = spread * 24; // total semitone range
  groups.forEach((g, i) => {
    const frac = i / (groups.length - 1);
    offsets.set(g, Math.round(frac * total - spread * 12));
  });
  return offsets;
}

export function buildMusicalEvents(rem, style) {
  const { actors, events, duration } = rem;
  const groupOffset = buildGroupOffsets(actors, style.octaveSpread);

  const actorPitch = new Map();
  for (const a of actors) {
    const degree = hashStr(a.id) % style.scale.length;
    const semis = style.scale[degree];
    const octave = groupOffset.get(a.group ?? 'default') ?? 0;
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
