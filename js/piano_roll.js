// Piano-roll visualisation. Vertical axis = actors grouped by colorKey, horizontal axis = time.
// Each event draws a thin vertical line from sender row to receiver row at the event's x.
// A playhead scrolls across as the piece plays.

import { colorsForActors } from './viz.js';

const NS = 'http://www.w3.org/2000/svg';
const W = 720;
const H = 380;
const MARGIN_LEFT = 70;
const MARGIN_TOP = 12;
const MARGIN_BOTTOM = 20;

function attrValue(actor, key) {
  if (!actor || !key) return undefined;
  if (actor.attributes && key in actor.attributes) return actor.attributes[key];
  if (key === 'group') return actor.group;
  return undefined;
}

let actorY = new Map();
let drawHeight = 0;
let drawWidth = 0;
let lastDuration = 1;

export function renderPianoRoll(svg, rem, colorKey, mutedValues = new Set()) {
  const { actors, events, duration } = rem;
  lastDuration = Math.max(duration, 1e-6);

  // Sort actors by colorKey value then by name. Group boundaries become visible.
  const sorted = [...actors].sort((a, b) => {
    const va = String(attrValue(a, colorKey) ?? '');
    const vb = String(attrValue(b, colorKey) ?? '');
    if (va !== vb) return va.localeCompare(vb);
    return String(a.id).localeCompare(String(b.id));
  });

  const colors = colorsForActors(actors, colorKey);
  drawHeight = H - MARGIN_TOP - MARGIN_BOTTOM;
  drawWidth = W - MARGIN_LEFT - 8;
  const rowH = drawHeight / Math.max(sorted.length, 1);
  actorY = new Map();
  sorted.forEach((a, i) => actorY.set(String(a.id), MARGIN_TOP + i * rowH + rowH / 2));

  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = `
    <g id="pr-bg"></g>
    <g id="pr-events"></g>
    <line id="pr-playhead" x1="${MARGIN_LEFT}" y1="${MARGIN_TOP}" x2="${MARGIN_LEFT}" y2="${MARGIN_TOP + drawHeight}" stroke="#ffd166" stroke-width="2" opacity="0"/>
    <g id="pr-labels"></g>
  `;
  const bg = svg.querySelector('#pr-bg');
  const ev = svg.querySelector('#pr-events');
  const labels = svg.querySelector('#pr-labels');

  // Alternating background bands per colorKey value, plus a colored swatch in the left margin.
  let i = 0;
  let lastValue = null;
  let bandStart = MARGIN_TOP;
  const drawBand = (yEnd, value) => {
    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', '0');
    rect.setAttribute('y', String(bandStart));
    rect.setAttribute('width', String(W));
    rect.setAttribute('height', String(yEnd - bandStart));
    rect.setAttribute('fill', colors.get(value) || '#ddd');
    rect.setAttribute('opacity', '0.07');
    bg.appendChild(rect);

    // Left swatch
    const swatch = document.createElementNS(NS, 'rect');
    swatch.setAttribute('x', '0');
    swatch.setAttribute('y', String(bandStart));
    swatch.setAttribute('width', String(MARGIN_LEFT - 8));
    swatch.setAttribute('height', String(yEnd - bandStart));
    swatch.setAttribute('fill', colors.get(value) || '#999');
    swatch.setAttribute('opacity', '0.5');
    bg.appendChild(swatch);

    // Label centred in band
    const tx = document.createElementNS(NS, 'text');
    tx.textContent = String(value);
    tx.setAttribute('x', String((MARGIN_LEFT - 8) / 2));
    tx.setAttribute('y', String((bandStart + yEnd) / 2));
    tx.setAttribute('text-anchor', 'middle');
    tx.setAttribute('dy', '0.35em');
    tx.setAttribute('font-size', '10');
    tx.setAttribute('fill', '#222');
    tx.setAttribute('font-weight', '600');
    labels.appendChild(tx);
  };
  sorted.forEach((a, idx) => {
    const v = String(attrValue(a, colorKey) ?? '');
    if (lastValue == null) lastValue = v;
    if (v !== lastValue) {
      drawBand(MARGIN_TOP + idx * rowH, lastValue);
      bandStart = MARGIN_TOP + idx * rowH;
      lastValue = v;
    }
  });
  drawBand(MARGIN_TOP + drawHeight, lastValue);

  // Events
  for (const e of events) {
    const senderActor = actors.find(a => String(a.id) === String(e.sender));
    const senderValue = attrValue(senderActor, colorKey);
    if (mutedValues.has(senderValue)) continue;

    const y1 = actorY.get(String(e.sender));
    const y2 = actorY.get(String(e.receiver));
    if (y1 == null || y2 == null) continue;
    const x = MARGIN_LEFT + (e.time / lastDuration) * drawWidth;
    const color = colors.get(senderValue) || '#888';

    if (y1 !== y2) {
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', x.toFixed(1));
      line.setAttribute('y1', y1.toFixed(1));
      line.setAttribute('x2', x.toFixed(1));
      line.setAttribute('y2', y2.toFixed(1));
      line.setAttribute('stroke', color);
      line.setAttribute('stroke-width', '1');
      line.setAttribute('opacity', '0.55');
      ev.appendChild(line);
    }
    const dot = document.createElementNS(NS, 'circle');
    dot.setAttribute('cx', x.toFixed(1));
    dot.setAttribute('cy', y1.toFixed(1));
    dot.setAttribute('r', '1.5');
    dot.setAttribute('fill', color);
    ev.appendChild(dot);
  }
}

export function updatePianoPlayhead(svg, fractionDone) {
  const ph = svg.querySelector('#pr-playhead');
  if (!ph) return;
  const x = MARGIN_LEFT + Math.max(0, Math.min(1, fractionDone)) * drawWidth;
  ph.setAttribute('x1', x.toFixed(1));
  ph.setAttribute('x2', x.toFixed(1));
  ph.setAttribute('opacity', '0.8');
}

export function resetPianoPlayhead(svg) {
  const ph = svg.querySelector('#pr-playhead');
  if (ph) ph.setAttribute('opacity', '0');
}
