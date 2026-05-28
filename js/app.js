import { generateSyntheticREM, parseCSV } from './data.js';
import { STYLES } from './styles.js';
import { buildMusicalEvents } from './mapping.js';
import { play, stop } from './player.js';
import { renderNetwork, flashEvent } from './viz.js';
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

let currentREM = generateSyntheticREM();
let currentStyle = 'chamber';
let currentDuration = ''; // empty string = match style default
let currentDatasetKey = 'synthetic';
let isPlaying = false;

function refreshSummary() {
  $('#summary').textContent =
    `${currentREM.actors.length} actors · ${currentREM.events.length} events · ` +
    `original duration ${formatDuration(currentREM.duration)}.`;
}

function formatDuration(seconds) {
  if (seconds < 90)    return `${seconds.toFixed(0)} s`;
  if (seconds < 5400)  return `${(seconds / 60).toFixed(1)} min`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)} h`;
  return `${(seconds / 86400).toFixed(1)} days`;
}

function renderViz() { renderNetwork($('#network-viz'), currentREM.actors); }

function refreshCredit() {
  const el = $('#dataset-credit');
  if (currentREM.credit) {
    el.innerHTML = `<strong>${escape(currentREM.name || '')}.</strong> ${escape(currentREM.description || '')} <em>${escape(currentREM.credit)}</em> ${escape(currentREM.license || '')}`;
  } else {
    el.textContent = '';
  }
}

function escape(s) {
  return String(s).replace(/[&<>]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[c]));
}

async function loadDataset(key) {
  if (key === 'synthetic') return generateSyntheticREM();
  const res = await fetch(`data/${key}.json`);
  if (!res.ok) throw new Error(`Could not load ${key}.json (${res.status}).`);
  return await res.json();
}

function effectiveStyle() {
  const base = STYLES[currentStyle];
  const dur = parseFloat(currentDuration);
  if (!dur) return base;
  return { ...base, durationSeconds: dur };
}

function onTick(musicalEvent) {
  flashEvent($('#network-viz'), musicalEvent.raw.sender, musicalEvent.raw.receiver);
  const sName = currentREM.actors.find(a => String(a.id) === String(musicalEvent.raw.sender))?.name || musicalEvent.raw.sender;
  const rName = currentREM.actors.find(a => String(a.id) === String(musicalEvent.raw.receiver))?.name || musicalEvent.raw.receiver;
  $('#now-playing').textContent = `${sName} → ${rName}  (${musicalEvent.raw.type})`;
}

function setStatus(text) { $('#status').textContent = text; }

function setPlaying(state) {
  isPlaying = state;
  $('#play').textContent = state ? 'Playing…' : 'Play';
  $('#play').disabled = state;
  setStatus(state ? 'Playing.' : '');
}

$('#play').addEventListener('click', async () => {
  if (isPlaying) return;
  const style = effectiveStyle();
  const musical = buildMusicalEvents(currentREM, style);
  if (!musical.length) { setStatus('No events to play.'); return; }
  setPlaying(true);
  try {
    await play(musical, style, onTick, () => {
      setPlaying(false);
      $('#now-playing').textContent = '';
    });
  } catch (err) {
    console.error(err);
    setStatus('Error: ' + err.message);
    setPlaying(false);
  }
});

$('#stop').addEventListener('click', () => {
  stop();
  setPlaying(false);
  $('#now-playing').textContent = '';
});

$('#download-midi').addEventListener('click', () => {
  const style = effectiveStyle();
  const musical = buildMusicalEvents(currentREM, style);
  try {
    exportMIDI(musical, style, `musicalnetworks-${currentDatasetKey}-${currentStyle}.mid`);
    setStatus('MIDI downloaded.');
  } catch (err) {
    console.error(err);
    setStatus('Error: ' + err.message);
  }
});

$('#style').addEventListener('change', (e) => {
  currentStyle = e.target.value;
  $('#style-desc').textContent = STYLES[currentStyle].description;
});

$('#duration').addEventListener('change', (e) => {
  currentDuration = e.target.value;
});

$('#regenerate').addEventListener('click', () => {
  stop();
  setPlaying(false);
  currentREM = generateSyntheticREM();
  refreshSummary();
  refreshCredit();
  renderViz();
});

$('#dataset').addEventListener('change', async (e) => {
  stop();
  setPlaying(false);
  currentDatasetKey = e.target.value;
  $('#regenerate').hidden = currentDatasetKey !== 'synthetic';
  setStatus('Loading…');
  try {
    currentREM = await loadDataset(currentDatasetKey);
    refreshSummary();
    refreshCredit();
    renderViz();
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
    currentREM = parseCSV(text);
    currentDatasetKey = 'csv';
    $('#dataset').value = 'synthetic'; // reset dropdown UI; user uploads aren't in the list
    $('#regenerate').hidden = true;
    refreshSummary();
    refreshCredit();
    renderViz();
    setStatus(`Loaded ${file.name}.`);
  } catch (err) {
    setStatus('Error: ' + err.message);
  }
});

// Populate dataset dropdown.
const datasetSelect = $('#dataset');
for (const d of DATASETS) {
  const opt = document.createElement('option');
  opt.value = d.key;
  opt.textContent = d.label;
  datasetSelect.appendChild(opt);
}
datasetSelect.value = 'synthetic';
$('#regenerate').hidden = false;

// Populate style dropdown.
const styleSelect = $('#style');
for (const key of Object.keys(STYLES)) {
  const opt = document.createElement('option');
  opt.value = key;
  opt.textContent = STYLES[key].name;
  styleSelect.appendChild(opt);
}
styleSelect.value = currentStyle;
$('#style-desc').textContent = STYLES[currentStyle].description;

refreshSummary();
refreshCredit();
renderViz();
