import { generateSyntheticREM, parseCSV } from './data.js';
import { STYLES } from './styles.js';
import { buildMusicalEvents, availableAttributeKeys, distinctValues, attributeValue } from './mapping.js';
import { play, stop } from './player.js';
import { renderNetwork, flashEvent, colorsForActors } from './viz.js';
import { renderPianoRoll, updatePianoPlayhead, resetPianoPlayhead } from './piano_roll.js';
import { renderSonia, soniaFlash, soniaTick, soniaReset } from './sonia_viz.js';
import { exportMIDI } from './midi.js';

const $ = (sel) => document.querySelector(sel);

const DATASETS = [
  { key: 'synthetic',      label: 'Synthetic (generated)' },
  { key: 'workplace',      label: 'SocioPatterns · Workplace' },
  { key: 'hospital',       label: 'SocioPatterns · Hospital ward' },
  { key: 'primary_school', label: 'SocioPatterns · Primary school' },
  { key: 'eu_core',        label: 'SNAP · EU research emails' },
  { key: 'radoslaw',       label: 'Manufacturing email (Radoslaw)' },
];

const PRESETS = [
  {
    title: 'Hospital · hierarchy as modes',
    sub: 'Roles in different octaves, ranks in different musical modes (bright → dark).',
    hash: 'd=hospital&s=ambient&t=300&r=role&mo=rank',
  },
  {
    title: 'Workplace · departments as instruments',
    sub: 'Each department plays a different instrument over chamber music.',
    hash: 'd=workplace&s=chamber&t=180&r=department&i=department',
  },
  {
    title: 'Primary school · class & gender',
    sub: 'Classes in different registers, gender drives the instrument.',
    hash: 'd=primary_school&s=electronic&t=120&r=class&i=gender',
  },
  {
    title: 'Manufacturing · slow drone',
    sub: '80 actors, one busy month, stretched into a 10-minute drone piece.',
    hash: 'd=radoslaw&s=drone&t=600',
  },
  {
    title: 'EU research emails · ambient wash',
    sub: '531 researchers across departments. Long sustained pads.',
    hash: 'd=eu_core&s=ambient&t=300&r=department',
  },
  {
    title: 'Synthetic · seniority modes',
    sub: 'Built-in test data with three seniority levels driving the mode.',
    hash: 'd=synthetic&s=chamber&t=120&r=group&mo=level',
  },
];

// ---- State ----------------------------------------------------------------
const state = {
  datasetKey: 'synthetic',
  rem: null,
  style: 'chamber',
  duration: '',                              // '' = use style default
  mapping: { register: null, instrument: 'type', mode: 'none' },
  muted: new Set(),
};
let isPlaying = false;
let currentViz = 'network';
let playheadRAF = null;

// ---- Hash sync ------------------------------------------------------------
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  return {
    d:   p.get('d') || '',
    s:   p.get('s') || '',
    t:   p.get('t') || '',
    r:   p.get('r') || '',
    i:   p.get('i') || '',
    mo:  p.get('mo') || '',
    mu:  (p.get('mu') || '').split(',').map(decodeURIComponent).filter(Boolean),
  };
}
let writingHash = false;
function writeHash() {
  if (writingHash) return;
  writingHash = true;
  const p = new URLSearchParams();
  if (state.datasetKey && state.datasetKey !== 'synthetic') p.set('d', state.datasetKey);
  if (state.style && state.style !== 'chamber')             p.set('s', state.style);
  if (state.duration)                                       p.set('t', state.duration);
  if (state.mapping.register)                               p.set('r', state.mapping.register);
  if (state.mapping.instrument && state.mapping.instrument !== 'type') p.set('i', state.mapping.instrument);
  if (state.mapping.mode && state.mapping.mode !== 'none')  p.set('mo', state.mapping.mode);
  if (state.muted.size) p.set('mu', [...state.muted].map(encodeURIComponent).join(','));
  const h = p.toString();
  const url = h ? `${location.pathname}#${h}` : location.pathname;
  history.replaceState(null, '', url);
  writingHash = false;
}

// ---- Data loading ---------------------------------------------------------
async function loadDataset(key) {
  if (key === 'synthetic') return generateSyntheticREM();
  const res = await fetch(`data/${key}.json`);
  if (!res.ok) throw new Error(`Could not load ${key}.json (${res.status}).`);
  return await res.json();
}

// ---- Sound Mapping panel --------------------------------------------------
function rebuildMappingPanel() {
  const attrs = availableAttributeKeys(state.rem);

  fillSelect($('#map-register'),   [...attrs, 'none'],          state.mapping.register || attrs[0]);
  fillSelect($('#map-instrument'), ['type', ...attrs, 'none'],   state.mapping.instrument || 'type');
  fillSelect($('#map-mode'),       ['none', ...attrs],          state.mapping.mode || 'none');

  // Update internal state to match selects (in case defaults shifted on dataset change).
  state.mapping.register   = $('#map-register').value;
  state.mapping.instrument = $('#map-instrument').value;
  state.mapping.mode       = $('#map-mode').value;
}

function fillSelect(el, options, selected) {
  el.innerHTML = '';
  for (const opt of options) {
    const o = document.createElement('option');
    o.value = opt;
    o.textContent = opt;
    el.appendChild(o);
  }
  if (selected != null && [...el.options].some(o => o.value === selected)) {
    el.value = selected;
  } else {
    el.value = options[0];
  }
}

// ---- Mute panel -----------------------------------------------------------
function rebuildMutePanel() {
  const panel = $('#mute-panel');
  panel.innerHTML = '';
  const key = state.mapping.register;
  if (!key || key === 'none') {
    panel.innerHTML = '<span class="muted small">No register attribute selected.</span>';
    return;
  }
  const values = distinctValues(state.rem.actors, key);
  const colors = colorsForActors(state.rem.actors, key);
  for (const v of values) {
    const chip = document.createElement('button');
    chip.className = 'mute-chip' + (state.muted.has(v) ? ' muted' : '');
    chip.textContent = v;
    chip.style.background = colors.get(v);
    chip.title = `Click to ${state.muted.has(v) ? 'unmute' : 'mute'} ${key}=${v}`;
    chip.addEventListener('click', () => {
      if (state.muted.has(v)) state.muted.delete(v); else state.muted.add(v);
      rebuildMutePanel();
      renderViz();
      writeHash();
    });
    panel.appendChild(chip);
  }
}

// ---- Viz ------------------------------------------------------------------
function activeRegisterKey() {
  return state.mapping.register || availableAttributeKeys(state.rem)[0] || 'group';
}

function renderViz() {
  // Render all visualisations so switching tabs is instant and stays in sync
  // with the current data / mapping / mute state. Each render is cheap
  // (10-100ms even on dense datasets); doing it once on each change beats
  // showing stale content the moment a tab is switched.
  //
  // SONIA's force layout costs ~1-2s on >300 nodes, so only render it when
  // its tab is the active one, and cache positions thereafter.
  const key = activeRegisterKey();
  renderNetwork($('#network-viz'), state.rem, key, state.muted);
  renderPianoRoll($('#piano-roll'), state.rem, key, state.muted);
  if (currentViz === 'sonia') {
    soniaReset();
    renderSonia($('#sonia-viz'), state.rem, key, state.muted);
  }
}

function switchViz(mode) {
  currentViz = mode;
  document.querySelectorAll('.viz-tab').forEach(t => t.classList.toggle('active', t.dataset.viz === mode));
  // SVGElement does not inherit HTMLElement.hidden, so the .hidden IDL
  // property doesn't reflect to the attribute. Toggle the attribute directly.
  document.querySelectorAll('.viz-canvas').forEach(c => c.toggleAttribute('hidden', c.dataset.viz !== mode));
  // Show the relevant per-tab help line.
  const active = document.querySelector(`.viz-tab[data-viz="${mode}"]`);
  $('#viz-help').textContent = active ? (active.dataset.help || '') : '';
  // SONIA needs a fresh force layout when its tab becomes active.
  if (mode === 'sonia') {
    soniaReset();
    renderSonia($('#sonia-viz'), state.rem, activeRegisterKey(), state.muted);
  } else {
    renderViz();
  }
}

function startPlayheadLoop() {
  cancelAnimationFrame(playheadRAF);
  const Tone = window.Tone;
  const totalDuration = effectiveStyle().durationSeconds;
  const tick = (now) => {
    if (!isPlaying) return;
    if (currentViz === 'piano') {
      const t = Tone.Transport.seconds;
      updatePianoPlayhead($('#piano-roll'), t / Math.max(totalDuration, 0.001));
    } else if (currentViz === 'sonia') {
      soniaTick($('#sonia-viz'), now);
    }
    playheadRAF = requestAnimationFrame(tick);
  };
  playheadRAF = requestAnimationFrame(tick);
}

function stopPlayheadLoop() {
  cancelAnimationFrame(playheadRAF);
  resetPianoPlayhead($('#piano-roll'));
  soniaReset();
}

// ---- Summary / credit ----------------------------------------------------
function refreshSummary() {
  $('#summary').textContent =
    `${state.rem.actors.length} actors · ${state.rem.events.length} events · ` +
    `original duration ${formatDuration(state.rem.duration)}.`;
}
function formatDuration(seconds) {
  if (seconds < 90)    return `${seconds.toFixed(0)} s`;
  if (seconds < 5400)  return `${(seconds / 60).toFixed(1)} min`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)} h`;
  return `${(seconds / 86400).toFixed(1)} days`;
}
function refreshCredit() {
  const el = $('#dataset-credit');
  const r = state.rem;
  if (r && r.credit) {
    el.innerHTML = `<strong>${escape(r.name || '')}.</strong> ${escape(r.description || '')} <em>${escape(r.credit)}</em> ${escape(r.license || '')}`;
  } else {
    el.textContent = '';
  }
}
function escape(s) {
  return String(s).replace(/[&<>]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[c]));
}

// ---- Playback ------------------------------------------------------------
function effectiveStyle() {
  const base = STYLES[state.style];
  const dur = parseFloat(state.duration);
  if (!dur) return base;
  return { ...base, durationSeconds: dur };
}
function onTick(musicalEvent) {
  if (currentViz === 'network') {
    flashEvent($('#network-viz'), musicalEvent.raw.sender, musicalEvent.raw.receiver);
  } else if (currentViz === 'sonia') {
    soniaFlash($('#sonia-viz'), musicalEvent.raw.sender, musicalEvent.raw.receiver, activeRegisterKey(), state.rem);
  }
  const sName = state.rem.actors.find(a => String(a.id) === String(musicalEvent.raw.sender))?.name || musicalEvent.raw.sender;
  const rName = state.rem.actors.find(a => String(a.id) === String(musicalEvent.raw.receiver))?.name || musicalEvent.raw.receiver;
  $('#now-playing').textContent = `${sName} → ${rName}  (${musicalEvent.raw.type})`;
}
function setStatus(text) { $('#status').textContent = text; }
function setPlaying(s) {
  isPlaying = s;
  $('#play').textContent = s ? 'Playing…' : 'Play';
  $('#play').disabled = s;
  setStatus(s ? 'Playing.' : '');
}
function buildMusical() {
  return buildMusicalEvents(state.rem, effectiveStyle(), state.mapping, state.muted);
}

// ---- Event wiring --------------------------------------------------------
$('#play').addEventListener('click', async () => {
  if (isPlaying) return;
  const style = effectiveStyle();
  const musical = buildMusical();
  if (!musical.length) { setStatus('No events to play.'); return; }
  setPlaying(true);
  startPlayheadLoop();
  try {
    await play(musical, style, onTick, () => {
      setPlaying(false);
      $('#now-playing').textContent = '';
      stopPlayheadLoop();
    });
  } catch (err) {
    console.error(err);
    setStatus('Error: ' + err.message);
    setPlaying(false);
    stopPlayheadLoop();
  }
});

$('#stop').addEventListener('click', () => {
  stop();
  setPlaying(false);
  $('#now-playing').textContent = '';
  stopPlayheadLoop();
});

$('#download-midi').addEventListener('click', () => {
  const style = effectiveStyle();
  const musical = buildMusical();
  try {
    exportMIDI(musical, style, `musicalnetworks-${state.datasetKey}-${state.style}.mid`);
    setStatus('MIDI downloaded.');
  } catch (err) {
    console.error(err);
    setStatus('Error: ' + err.message);
  }
});

$('#copy-link').addEventListener('click', async () => {
  writeHash();
  try {
    await navigator.clipboard.writeText(location.href);
    setStatus('Link copied.');
  } catch (e) {
    setStatus('Copy failed — link is in the address bar.');
  }
});

$('#style').addEventListener('change', (e) => {
  state.style = e.target.value;
  $('#style-desc').textContent = STYLES[state.style].description;
  writeHash();
});

$('#duration').addEventListener('change', (e) => {
  state.duration = e.target.value;
  writeHash();
});

$('#map-register').addEventListener('change', (e) => {
  state.mapping.register = e.target.value === 'none' ? 'none' : e.target.value;
  // Register change resets mute (values may differ).
  state.muted.clear();
  rebuildMutePanel();
  renderViz();
  writeHash();
});
$('#map-instrument').addEventListener('change', (e) => {
  state.mapping.instrument = e.target.value;
  writeHash();
});
$('#map-mode').addEventListener('change', (e) => {
  state.mapping.mode = e.target.value;
  writeHash();
});

$('#regenerate').addEventListener('click', () => {
  stop();
  setPlaying(false);
  state.rem = generateSyntheticREM();
  refreshAfterDatasetChange();
});

$('#dataset').addEventListener('change', async (e) => {
  stop();
  setPlaying(false);
  state.datasetKey = e.target.value;
  $('#regenerate').hidden = state.datasetKey !== 'synthetic';
  setStatus('Loading…');
  try {
    state.rem = await loadDataset(state.datasetKey);
    refreshAfterDatasetChange();
    setStatus('');
  } catch (err) {
    setStatus('Error: ' + err.message);
  }
});

$('#csv-upload').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    state.rem = parseCSV(text);
    state.datasetKey = 'csv';
    $('#dataset').value = 'synthetic';
    $('#regenerate').hidden = true;
    refreshAfterDatasetChange();
    setStatus(`Loaded ${file.name}.`);
  } catch (err) {
    setStatus('Error: ' + err.message);
  }
});

function refreshAfterDatasetChange() {
  // Reset mapping to first attribute / type / none unless explicit values still valid.
  const attrs = availableAttributeKeys(state.rem);
  if (!attrs.includes(state.mapping.register) && state.mapping.register !== 'none') {
    state.mapping.register = attrs[0] || 'group';
  }
  if (state.mapping.instrument !== 'type' && state.mapping.instrument !== 'none' && !attrs.includes(state.mapping.instrument)) {
    state.mapping.instrument = 'type';
  }
  if (state.mapping.mode !== 'none' && !attrs.includes(state.mapping.mode)) {
    state.mapping.mode = 'none';
  }
  state.muted.clear();
  rebuildMappingPanel();
  rebuildMutePanel();
  refreshSummary();
  refreshCredit();
  renderViz();
  writeHash();
}

// ---- Presets -------------------------------------------------------------
function renderPresets() {
  const grid = $('#preset-grid');
  if (!grid) return;
  grid.innerHTML = '';
  for (const p of PRESETS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'preset-btn';
    b.innerHTML = `<span class="preset-title">${escape(p.title)}</span><span class="preset-sub">${escape(p.sub)}</span>`;
    b.addEventListener('click', () => {
      location.hash = p.hash;
      location.reload();
    });
    grid.appendChild(b);
  }
}

// ---- Init -----------------------------------------------------------------
async function init() {
  renderPresets();

  // Populate dataset and style dropdowns.
  const datasetSelect = $('#dataset');
  for (const d of DATASETS) {
    const opt = document.createElement('option');
    opt.value = d.key; opt.textContent = d.label;
    datasetSelect.appendChild(opt);
  }
  const styleSelect = $('#style');
  for (const key of Object.keys(STYLES)) {
    const opt = document.createElement('option');
    opt.value = key; opt.textContent = STYLES[key].name;
    styleSelect.appendChild(opt);
  }

  // Read URL hash for initial state.
  const hash = readHash();
  if (hash.d && DATASETS.some(d => d.key === hash.d)) state.datasetKey = hash.d;
  if (hash.s && STYLES[hash.s]) state.style = hash.s;
  if (hash.t) state.duration = hash.t;

  datasetSelect.value  = state.datasetKey;
  styleSelect.value    = state.style;
  $('#duration').value = state.duration;
  $('#regenerate').hidden = state.datasetKey !== 'synthetic';
  $('#style-desc').textContent = STYLES[state.style].description;

  // Load dataset.
  try {
    state.rem = await loadDataset(state.datasetKey);
  } catch (err) {
    setStatus('Error: ' + err.message);
    state.rem = generateSyntheticREM();
    state.datasetKey = 'synthetic';
    datasetSelect.value = 'synthetic';
    $('#regenerate').hidden = false;
  }

  // Apply hash mapping where attribute keys are valid for the loaded dataset.
  const attrs = availableAttributeKeys(state.rem);
  if (hash.r && (hash.r === 'none' || attrs.includes(hash.r))) state.mapping.register = hash.r;
  else state.mapping.register = attrs[0] || 'group';
  if (hash.i && (hash.i === 'type' || hash.i === 'none' || attrs.includes(hash.i))) state.mapping.instrument = hash.i;
  if (hash.mo && (hash.mo === 'none' || attrs.includes(hash.mo))) state.mapping.mode = hash.mo;
  state.muted = new Set(hash.mu);

  rebuildMappingPanel();
  rebuildMutePanel();
  refreshSummary();
  refreshCredit();
  renderViz();

  // Tab switching.
  document.querySelectorAll('.viz-tab').forEach(t => {
    t.addEventListener('click', () => switchViz(t.dataset.viz));
  });
  // Seed initial tab help text.
  const initialActive = document.querySelector('.viz-tab.active');
  if (initialActive) $('#viz-help').textContent = initialActive.dataset.help || '';
}

init();
