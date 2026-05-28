// Map REM events to scheduled musical events given a style preset and an
// optional sound-mapping config.
//
// Sound mapping decides which actor attribute drives which musical dimension:
//   register   -> attribute key (or 'none')
//   instrument -> attribute key, 'type' (use style.instruments[event.type]), or 'none'
//   mode       -> attribute key (or 'none')
//
// muted is a Set of values (from the register attribute) whose events are skipped.

// Modes ordered from brightest to darkest. Ordinal attribute values get assigned
// modes in this order so a "higher rank" can predictably sound brighter or
// darker than a "lower rank" depending on which way you sort.
const MODES_BY_BRIGHTNESS = ['Lydian', 'Ionian', 'Mixolydian', 'Dorian', 'Aeolian', 'Phrygian', 'Locrian'];
const MODE_INTERVALS = {
  Lydian:     [0, 2, 4, 6, 7, 9, 11],
  Ionian:     [0, 2, 4, 5, 7, 9, 11],
  Mixolydian: [0, 2, 4, 5, 7, 9, 10],
  Dorian:     [0, 2, 3, 5, 7, 9, 10],
  Aeolian:    [0, 2, 3, 5, 7, 8, 10],
  Phrygian:   [0, 1, 3, 5, 7, 8, 10],
  Locrian:    [0, 1, 3, 5, 6, 8, 10],
};

// Tonal instrument presets in a rough light-to-dense ordering. Used when an
// attribute drives instrument choice; values get distinct presets in this
// order, cycling for >7 values.
const INSTRUMENT_POOL = ['piano', 'string', 'pluck', 'pad', 'bell', 'lead', 'bass'];

function hashStr(s) {
  s = String(s);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0);
}

export function attributeValue(actor, key) {
  if (!actor || key == null || key === 'none') return undefined;
  if (actor.attributes && key in actor.attributes) return actor.attributes[key];
  if (key === 'group') return actor.group;
  return undefined;
}

export function distinctValues(actors, key) {
  if (!key || key === 'none') return [];
  const vals = new Set();
  for (const a of actors) {
    const v = attributeValue(a, key);
    if (v != null) vals.add(v);
  }
  return [...vals].sort();
}

export function availableAttributeKeys(rem) {
  // Prefer the explicit `attributes` list declared by the dataset, otherwise
  // fall back to whatever keys appear on actor.attributes (or 'group').
  if (Array.isArray(rem.attributes) && rem.attributes.length) return [...rem.attributes];
  const keys = new Set();
  for (const a of rem.actors || []) {
    if (a.attributes) Object.keys(a.attributes).forEach(k => keys.add(k));
  }
  if (!keys.size) keys.add('group');
  return [...keys];
}

function buildOffsets(values, spread) {
  const m = new Map();
  if (!values.length) return m;
  if (values.length === 1) { m.set(values[0], 0); return m; }
  const total = spread * 24;
  values.forEach((v, i) => {
    const frac = i / (values.length - 1);
    m.set(v, Math.round(frac * total - spread * 12));
  });
  return m;
}

function buildModeAssignment(values) {
  const m = new Map();
  values.forEach((v, i) => m.set(v, MODES_BY_BRIGHTNESS[i % MODES_BY_BRIGHTNESS.length]));
  return m;
}

function buildInstrumentAssignment(values) {
  const m = new Map();
  values.forEach((v, i) => m.set(v, INSTRUMENT_POOL[i % INSTRUMENT_POOL.length]));
  return m;
}

export function buildMusicalEvents(rem, style, mapping = {}, muted = new Set()) {
  const { actors, events, duration } = rem;
  const actorById = new Map(actors.map(a => [String(a.id), a]));

  // Default: register driven by the first available attribute (or 'group').
  const registerKey = (mapping.register && mapping.register !== 'none')
    ? mapping.register
    : (availableAttributeKeys(rem)[0] || 'group');
  const modeKey       = mapping.mode && mapping.mode !== 'none' ? mapping.mode : null;
  const instMode      = mapping.instrument || 'type';
  const instAttrKey   = (instMode !== 'type' && instMode !== 'none') ? instMode : null;

  const registerValues   = distinctValues(actors, registerKey);
  const registerOffsets  = buildOffsets(registerValues, style.octaveSpread);

  const modeValues       = modeKey ? distinctValues(actors, modeKey) : [];
  const modeAssign       = modeKey ? buildModeAssignment(modeValues) : null;

  const instValues       = instAttrKey ? distinctValues(actors, instAttrKey) : [];
  const instAssign       = instAttrKey ? buildInstrumentAssignment(instValues) : null;

  // Per-actor pitch.
  const actorPitch = new Map();
  for (const a of actors) {
    const scale = modeAssign
      ? (MODE_INTERVALS[modeAssign.get(attributeValue(a, modeKey))] || style.scale)
      : style.scale;
    const degree = hashStr(a.id) % scale.length;
    const semis = scale[degree];
    const octave = registerOffsets.get(attributeValue(a, registerKey)) ?? 0;
    actorPitch.set(String(a.id), style.rootMidi + semis + octave);
  }

  const timeScale = style.durationSeconds / Math.max(duration, 1e-6);
  const out = [];

  for (const ev of events) {
    const senderActor = actorById.get(String(ev.sender));
    const senderRegVal = attributeValue(senderActor, registerKey);
    if (muted.size && muted.has(senderRegVal)) continue;

    let t = ev.time * timeScale;
    if (style.quantize > 0) t = Math.round(t / style.quantize) * style.quantize;

    const senderPitch = actorPitch.get(String(ev.sender));
    const receiverPitch = actorPitch.get(String(ev.receiver));
    if (senderPitch == null || receiverPitch == null) continue;

    // Instrument
    let preset;
    if (instAssign) {
      preset = instAssign.get(attributeValue(senderActor, instAttrKey));
    } else if (instMode === 'none') {
      preset = (style.instruments.default || { preset: 'string' }).preset;
    } else {
      preset = (style.instruments[ev.type] || style.instruments.default).preset;
    }
    if (!preset) preset = 'string';

    const velocity = Math.min(1, 0.35 + (ev.weight || 1) * 0.12);
    const noteDuration = style.noteDuration
      ?? (style.quantize > 0 ? style.quantize * 2 : 1.8);

    out.push({
      time: t,
      senderPitch,
      receiverPitch,
      velocity,
      duration: noteDuration,
      instrument: { preset },
      raw: ev,
    });
  }

  return out;
}
