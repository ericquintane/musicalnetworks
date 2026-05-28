// SONIA-style dynamic network visualisation.
//
// Inspired by Skye Bender-deMoll and Dan McFarland's SONIA tool:
// nodes are positioned by a force-directed layout (computed once from the
// aggregated dyadic structure), and edges appear when events fire during
// playback, then fade over a sliding window.

import { colorsForActors } from './viz.js';

const NS = 'http://www.w3.org/2000/svg';
const SIZE = 400;

let positions = new Map();
let activeEdges = [];   // [{src, dst, color, opacity, weight}]
let lastFrame = 0;

const FADE_PER_SEC  = 0.6;   // opacity loss per second
const EDGE_MAX_OPAC = 0.85;

function attrValue(actor, key) {
  if (!actor || !key) return undefined;
  if (actor.attributes && key in actor.attributes) return actor.attributes[key];
  if (key === 'group') return actor.group;
  return undefined;
}

// ---- Force-directed layout (Fruchterman-Reingold) ----
function forceLayout(actors, edges, opts = {}) {
  const {
    width = SIZE * 0.86,
    height = SIZE * 0.86,
    iterations = 250,
  } = opts;

  const n = actors.length;
  if (n === 0) return new Map();

  const k = Math.sqrt((width * height) / n) * 0.6;
  const nodes = actors.map((a, i) => {
    const angle = (i / Math.max(n, 1)) * 2 * Math.PI + Math.random() * 0.1;
    const r = (width / 4) * (0.6 + Math.random() * 0.4);
    return { id: String(a.id), x: r * Math.cos(angle), y: r * Math.sin(angle), dx: 0, dy: 0 };
  });
  const byId = new Map(nodes.map(node => [node.id, node]));

  const resolved = edges
    .map(e => ({ source: byId.get(String(e.source)), target: byId.get(String(e.target)), w: e.w }))
    .filter(e => e.source && e.target && e.source !== e.target);

  let temperature = width / 8;

  for (let it = 0; it < iterations; it++) {
    // Reset
    for (const node of nodes) { node.dx = 0; node.dy = 0; }

    // Repulsion (O(n^2))
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 0.01) dist = 0.01;
        const force = (k * k) / dist;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        nodes[i].dx += fx; nodes[i].dy += fy;
        nodes[j].dx -= fx; nodes[j].dy -= fy;
      }
    }

    // Attraction by edges (weighted by log of dyad count for stability).
    for (const e of resolved) {
      const dx = e.source.x - e.target.x;
      const dy = e.source.y - e.target.y;
      let dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.01) dist = 0.01;
      const weight = Math.log(1 + e.w);
      const force = ((dist * dist) / k) * weight;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      e.source.dx -= fx; e.source.dy -= fy;
      e.target.dx += fx; e.target.dy += fy;
    }

    // Apply displacements capped by temperature.
    for (const node of nodes) {
      const disp = Math.sqrt(node.dx * node.dx + node.dy * node.dy) || 0.01;
      const move = Math.min(disp, temperature);
      node.x += (node.dx / disp) * move;
      node.y += (node.dy / disp) * move;
      // Clamp to a generous box so labels don't run off.
      const hw = width / 2 - 14;
      const hh = height / 2 - 14;
      if (node.x < -hw) node.x = -hw;
      if (node.x >  hw) node.x =  hw;
      if (node.y < -hh) node.y = -hh;
      if (node.y >  hh) node.y =  hh;
    }
    temperature *= 0.985;
  }

  const out = new Map();
  for (const node of nodes) out.set(node.id, { x: node.x, y: node.y });
  return out;
}

// ---- Public API ----
export function renderSonia(svg, rem, colorKey = 'group', mutedValues = new Set()) {
  const actors = (rem.actors || []).filter(a => !mutedValues.has(attrValue(a, colorKey)));
  const events = rem.events || [];

  // Build aggregated dyads.
  const dyadCounts = new Map();
  const actorSet = new Set(actors.map(a => String(a.id)));
  for (const e of events) {
    if (!actorSet.has(String(e.sender)) || !actorSet.has(String(e.receiver))) continue;
    const a = String(e.sender), b = String(e.receiver);
    const k = a < b ? `${a}|${b}` : `${b}|${a}`;
    dyadCounts.set(k, (dyadCounts.get(k) || 0) + 1);
  }
  const aggEdges = [...dyadCounts].map(([k, w]) => {
    const [s, t] = k.split('|');
    return { source: s, target: t, w };
  });

  positions = forceLayout(actors, aggEdges);
  activeEdges = [];

  const colors = colorsForActors(rem.actors || [], colorKey);
  const nodeR = actors.length > 200 ? 3 : actors.length > 100 ? 5 : actors.length > 50 ? 8 : 11;
  const fontSize = actors.length > 200 ? 0 : actors.length > 100 ? 7 : actors.length > 50 ? 8 : 10;

  svg.setAttribute('viewBox', `${-SIZE / 2} ${-SIZE / 2} ${SIZE} ${SIZE}`);
  svg.innerHTML = `
    <g class="sonia-bg-edges"></g>
    <g class="sonia-active-edges"></g>
    <g class="sonia-nodes"></g>
  `;
  const bgG    = svg.querySelector('.sonia-bg-edges');
  const nodesG = svg.querySelector('.sonia-nodes');

  // Static background edges for the aggregate dyads (very faint, so the
  // overall structure is visible even before playback starts).
  for (const e of aggEdges) {
    const a = positions.get(e.source);
    const b = positions.get(e.target);
    if (!a || !b) continue;
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', a.x.toFixed(1));
    line.setAttribute('y1', a.y.toFixed(1));
    line.setAttribute('x2', b.x.toFixed(1));
    line.setAttribute('y2', b.y.toFixed(1));
    line.setAttribute('stroke', '#888');
    line.setAttribute('stroke-width', Math.min(1.5, 0.3 + Math.log(1 + e.w) * 0.25).toFixed(2));
    line.setAttribute('opacity', '0.12');
    bgG.appendChild(line);
  }

  // Nodes (rendered last so they sit on top).
  for (const a of actors) {
    const pos = positions.get(String(a.id));
    if (!pos) continue;
    const value = attrValue(a, colorKey) ?? 'default';

    const g = document.createElementNS(NS, 'g');
    g.setAttribute('transform', `translate(${pos.x.toFixed(1)}, ${pos.y.toFixed(1)})`);
    g.setAttribute('data-id', String(a.id));
    g.setAttribute('class', 'viz-node sonia-node');

    const circle = document.createElementNS(NS, 'circle');
    circle.setAttribute('r', String(nodeR));
    circle.setAttribute('fill', colors.get(value) || '#888');
    g.appendChild(circle);

    if (fontSize > 0 && a.name) {
      const text = document.createElementNS(NS, 'text');
      text.textContent = a.name;
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dy', '0.35em');
      text.setAttribute('font-size', String(fontSize));
      g.appendChild(text);
    }

    nodesG.appendChild(g);
  }
}

// Called by app.js onTick for each musical event. Adds the dyad to the active
// list with full opacity; the rAF loop fades it out over a few seconds.
export function soniaFlash(svg, senderId, receiverId, colorKey, rem) {
  if (!positions.size) return;
  const sender = (rem.actors || []).find(a => String(a.id) === String(senderId));
  const value = attrValue(sender, colorKey);
  const colors = colorsForActors(rem.actors || [], colorKey);
  const color = colors.get(value) || '#ffd166';

  activeEdges.push({
    src: String(senderId),
    dst: String(receiverId),
    color,
    opacity: EDGE_MAX_OPAC,
  });

  // Briefly highlight nodes
  for (const id of [senderId, receiverId]) {
    const node = svg.querySelector(`.sonia-node[data-id="${CSS.escape(String(id))}"]`);
    if (node) {
      node.classList.add('active');
      clearTimeout(node._t);
      node._t = setTimeout(() => node.classList.remove('active'), 350);
    }
  }
}

// rAF tick: fades active edges and redraws them.
export function soniaTick(svg, now) {
  if (!positions.size) return;
  if (!lastFrame) lastFrame = now;
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;

  for (const e of activeEdges) e.opacity -= FADE_PER_SEC * dt;
  activeEdges = activeEdges.filter(e => e.opacity > 0.02);

  const g = svg.querySelector('.sonia-active-edges');
  if (!g) return;
  g.innerHTML = '';
  for (const e of activeEdges) {
    const a = positions.get(e.src);
    const b = positions.get(e.dst);
    if (!a || !b) continue;
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', a.x.toFixed(1));
    line.setAttribute('y1', a.y.toFixed(1));
    line.setAttribute('x2', b.x.toFixed(1));
    line.setAttribute('y2', b.y.toFixed(1));
    line.setAttribute('stroke', e.color);
    line.setAttribute('stroke-width', '2');
    line.setAttribute('opacity', e.opacity.toFixed(2));
    line.setAttribute('stroke-linecap', 'round');
    g.appendChild(line);
  }
}

export function soniaReset() {
  activeEdges = [];
  lastFrame = 0;
}
