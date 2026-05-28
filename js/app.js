import { generateSyntheticREM, parseCSV } from './data.js';
import { STYLES } from './styles.js';
import { buildMusicalEvents } from './mapping.js';
import { play, stop } from './player.js';
import { renderNetwork, flashEvent } from './viz.js';
import { exportMIDI } from './midi.js';

const $ = (sel) => document.querySelector(sel);

let currentREM = generateSyntheticREM();
let currentStyle = 'chamber';
let isPlaying = false;

function refreshSummary() {
  $('#summary').textContent =
    `${currentREM.actors.length} actors, ${currentREM.events.length} events, ` +
    `duration ${currentREM.duration.toFixed(1)} time units.`;
}

function renderViz() {
  renderNetwork($('#network-viz'), currentREM.actors);
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
  const style = STYLES[currentStyle];
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
  const style = STYLES[currentStyle];
  const musical = buildMusicalEvents(currentREM, style);
  try {
    exportMIDI(musical, style, `musicalnetworks-${currentStyle}.mid`);
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

$('#regenerate').addEventListener('click', () => {
  stop();
  setPlaying(false);
  currentREM = generateSyntheticREM();
  refreshSummary();
  renderViz();
});

$('#csv-upload').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    currentREM = parseCSV(text);
    refreshSummary();
    renderViz();
    setStatus(`Loaded ${file.name}.`);
  } catch (err) {
    setStatus('Error: ' + err.message);
  }
});

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
renderViz();
