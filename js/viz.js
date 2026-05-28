// Combined chord + network visualisation.
//
// The chord diagram (group arcs + inter-group ribbons) renders as a
// semi-transparent background. Actor nodes sit inside their group's arc.
// During playback, flashEvent() animates a fading arc from sender to receiver.

const NS = 'http://www.w3.org/2000/svg';
const SIZE = 400;
const ARC_OUTER = 175;
const ARC_INNER = 160;
const NODE_RADIUS_OUTER = 140; // ring on which actor nodes sit
const ARC_PAD = 0.025;

let positions = new Map();

function attrValue(actor, key) {
  if (!actor || !key) return undefined;
  if (actor.attributes && key in actor.attributes) return actor.attributes[key];
  if (key === 'group') return actor.group;
  return undefined;
}

function nodeRadiusFor(n) {
  if (n > 200) return 4;
  if (n > 100) return 6;
  if (n > 50)  return 9;
  return 13;
}
function fontSizeFor(n) {
  if (n > 200) return 0;
  if (n > 100) return 7;
  if (n > 50)  return 8;
  return 10;
}

// Assign each unique value of colorKey a distinct HSL color.
function buildColors(actors, colorKey) {
  const values = [...new Set(actors.map(a => attrValue(a, colorKey) ?? 'default'))].sort();
  const colors = new Map();
  values.forEach((v, i) => {
    const hue = Math.round((i / Math.max(values.length, 1)) * 320);
    colors.set(v, `hsl(${hue}, 55%, 55%)`);
  });
  return colors;
}

export function colorsForActors(actors, colorKey) {
  return buildColors(actors, colorKey);
}

function polar(angle, r) {
  return { x: r * Math.cos(angle), y: r * Math.sin(angle) };
}

function arcPath(start, end, innerR, outerR) {
  const p1 = polar(start, outerR);
  const p2 = polar(end, outerR);
  const p3 = polar(end, innerR);
  const p4 = polar(start, innerR);
  const big = end - start > Math.PI ? 1 : 0;
  return `M ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} ` +
         `A ${outerR} ${outerR} 0 ${big} 1 ${p2.x.toFixed(1)} ${p2.y.toFixed(1)} ` +
         `L ${p3.x.toFixed(1)} ${p3.y.toFixed(1)} ` +
         `A ${innerR} ${innerR} 0 ${big} 0 ${p4.x.toFixed(1)} ${p4.y.toFixed(1)} Z`;
}

function ribbonPath(segA, segB, r) {
  const p1 = polar(segA.start, r);
  const p2 = polar(segA.end, r);
  const p3 = polar(segB.start, r);
  const p4 = polar(segB.end, r);
  return `M ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} ` +
         `A ${r} ${r} 0 0 1 ${p2.x.toFixed(1)} ${p2.y.toFixed(1)} ` +
         `Q 0 0 ${p3.x.toFixed(1)} ${p3.y.toFixed(1)} ` +
         `A ${r} ${r} 0 0 1 ${p4.x.toFixed(1)} ${p4.y.toFixed(1)} ` +
         `Q 0 0 ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} Z`;
}

// Compute the chord layout (group arcs and ribbons) from the events.
function chordLayout(actors, events, colorKey, mutedValues) {
  const actorGroup = new Map(actors.map(a => [String(a.id), attrValue(a, colorKey)]));
  const allValues = [...new Set([...actorGroup.values()].filter(v => v != null))].sort();
  const visible = allValues.filter(v => !mutedValues.has(v));
  if (visible.length < 1) return null;
  const idx = new Map(visible.map((g, i) => [g, i]));
  const n = visible.length;

  const M = Array.from({ length: n }, () => new Array(n).fill(0));
  for (const e of events) {
    const gi = actorGroup.get(String(e.sender));
    const gj = actorGroup.get(String(e.receiver));
    const i = idx.get(gi), j = idx.get(gj);
    if (i == null || j == null) continue;
    M[i][j] += 1;
  }
  const totals = visible.map((_, i) =>
    visible.reduce((s, _, j) => s + M[i][j] + M[j][i], 0));
  // If no events fall in visible groups, fall back to equal-sized arcs.
  let grand = totals.reduce((a, b) => a + b, 0);
  const fallbackSizes = grand === 0;
  if (fallbackSizes) {
    totals.forEach((_, i) => totals[i] = 1);
    grand = n;
  }
  const totalPad = ARC_PAD * n;
  const available = 2 * Math.PI - totalPad;

  let angle = -Math.PI / 2;
  const arcs = visible.map((g, i) => {
    const span = (totals[i] / grand) * available;
    const a = { group: g, start: angle, end: angle + span, span };
    angle = a.end + ARC_PAD;
    return a;
  });

  // Sub-segments inside each arc: i's portion that points to j.
  const segments = arcs.map((arc, i) => {
    const segs = new Array(n);
    let a = arc.start;
    for (let j = 0; j < n; j++) {
      const count = fallbackSizes ? 0 : M[i][j];
      const span = totals[i] > 0 ? (count / totals[i]) * arc.span : 0;
      segs[j] = { start: a, end: a + span, count };
      a += span;
    }
    return segs;
  });

  return { visible, arcs, segments, M, totals, n, actorGroup };
}

// Place actor nodes around the inner side of each arc.
function placeActors(actors, layout, mutedValues) {
  positions = new Map();
  if (!layout) return positions;
  const { arcs, actorGroup } = layout;
  const groupIndex = new Map();
  arcs.forEach((arc, i) => groupIndex.set(arc.group, i));

  // Sort actors and bucket by group.
  const byGroup = new Map();
  for (const a of actors) {
    const g = actorGroup.get(String(a.id));
    if (g == null) continue;
    if (mutedValues.has(g)) continue;
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push(a);
  }

  for (const arc of arcs) {
    const list = byGroup.get(arc.group) || [];
    if (!list.length) continue;
    // Distribute actors within the arc with a small padding from the edges.
    const padding = Math.min(arc.span * 0.08, 0.05);
    const lo = arc.start + padding;
    const hi = arc.end - padding;
    if (list.length === 1) {
      positions.set(String(list[0].id), polar((lo + hi) / 2, NODE_RADIUS_OUTER));
    } else {
      list.forEach((a, i) => {
        const frac = list.length > 1 ? i / (list.length - 1) : 0.5;
        const ang = lo + frac * (hi - lo);
        positions.set(String(a.id), polar(ang, NODE_RADIUS_OUTER));
      });
    }
  }
  return positions;
}

export function renderNetwork(svg, rem, colorKey = 'group', mutedValues = new Set()) {
  // rem is the full dataset object: { actors, events, ... }
  const actors = rem.actors || [];
  const events = rem.events || [];
  const layout = chordLayout(actors, events, colorKey, mutedValues);
  positions = placeActors(actors, layout, mutedValues);

  const colors = buildColors(actors, colorKey);
  const nodeR = nodeRadiusFor(actors.length);
  const fontSize = fontSizeFor(actors.length);

  svg.setAttribute('viewBox', `${-SIZE / 2} ${-SIZE / 2} ${SIZE} ${SIZE}`);
  svg.innerHTML = `
    <g class="bg-ribbons"></g>
    <g class="bg-arcs"></g>
    <g class="bg-labels"></g>
    <g class="viz-edges-runtime"></g>
    <g class="viz-nodes"></g>
  `;
  const ribbonsG = svg.querySelector('.bg-ribbons');
  const arcsG = svg.querySelector('.bg-arcs');
  const labelsG = svg.querySelector('.bg-labels');
  const nodesG = svg.querySelector('.viz-nodes');

  // Background ribbons (very subtle).
  if (layout) {
    for (let i = 0; i < layout.n; i++) {
      for (let j = i; j < layout.n; j++) {
        const segA = layout.segments[i][j];
        const segB = layout.segments[j][i];
        if (segA.count + segB.count === 0) continue;
        const r = ARC_INNER - 1;
        const d = ribbonPath(segA, segB, r);
        const path = document.createElementNS(NS, 'path');
        path.setAttribute('d', d);
        const colorIdx = layout.totals[i] >= layout.totals[j] ? i : j;
        path.setAttribute('fill', colors.get(layout.visible[colorIdx]) || '#888');
        path.setAttribute('opacity', '0.15');
        const title = document.createElementNS(NS, 'title');
        title.textContent = i === j
          ? `${layout.visible[i]} ↔ ${layout.visible[i]} (within): ${segA.count}`
          : `${layout.visible[i]} ↔ ${layout.visible[j]}: ${segA.count + segB.count}`;
        path.appendChild(title);
        ribbonsG.appendChild(path);
      }
    }

    // Outer arcs + labels.
    layout.arcs.forEach((arc, i) => {
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', arcPath(arc.start, arc.end, ARC_INNER, ARC_OUTER));
      path.setAttribute('fill', colors.get(layout.visible[i]) || '#888');
      path.setAttribute('opacity', '0.55');
      arcsG.appendChild(path);

      const mid = (arc.start + arc.end) / 2;
      const lx = (ARC_OUTER + 12) * Math.cos(mid);
      const ly = (ARC_OUTER + 12) * Math.sin(mid);
      const text = document.createElementNS(NS, 'text');
      text.textContent = `${layout.visible[i]}`;
      text.setAttribute('x', lx.toFixed(1));
      text.setAttribute('y', ly.toFixed(1));
      text.setAttribute('text-anchor', Math.cos(mid) > 0.15 ? 'start' : (Math.cos(mid) < -0.15 ? 'end' : 'middle'));
      text.setAttribute('dy', '0.35em');
      text.setAttribute('font-size', '11');
      text.setAttribute('fill', '#444');
      text.setAttribute('font-weight', '600');
      labelsG.appendChild(text);
    });
  }

  // Actor nodes (foreground).
  for (const a of actors) {
    const pos = positions.get(String(a.id));
    if (!pos) continue;
    const value = attrValue(a, colorKey) ?? 'default';
    const isMuted = mutedValues.has(value);

    const g = document.createElementNS(NS, 'g');
    g.setAttribute('transform', `translate(${pos.x.toFixed(1)}, ${pos.y.toFixed(1)})`);
    g.setAttribute('data-id', String(a.id));
    g.setAttribute('class', 'viz-node');

    const circle = document.createElementNS(NS, 'circle');
    circle.setAttribute('r', String(nodeR));
    circle.setAttribute('fill', colors.get(value) || '#888');
    circle.setAttribute('opacity', isMuted ? '0.2' : '1');
    g.appendChild(circle);

    if (fontSize > 0 && a.name) {
      const text = document.createElementNS(NS, 'text');
      text.textContent = a.name;
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dy', '0.35em');
      text.setAttribute('font-size', String(fontSize));
      text.setAttribute('opacity', isMuted ? '0.4' : '1');
      g.appendChild(text);
    }

    nodesG.appendChild(g);
  }
}

export function flashEvent(svg, senderId, receiverId) {
  const a = positions.get(String(senderId));
  const b = positions.get(String(receiverId));
  if (!a || !b) return;

  svg.querySelectorAll('.viz-node').forEach(g => {
    if (g.dataset.id === String(senderId) || g.dataset.id === String(receiverId)) {
      g.classList.add('active');
      clearTimeout(g._t);
      g._t = setTimeout(() => g.classList.remove('active'), 400);
    }
  });

  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
  const offset = Math.min(45, len * 0.25);
  const cpx = mx - (dy / len) * offset;
  const cpy = my + (dx / len) * offset;

  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q ${cpx.toFixed(1)} ${cpy.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`);
  path.setAttribute('class', 'viz-edge');
  svg.querySelector('.viz-edges-runtime').appendChild(path);

  requestAnimationFrame(() => path.classList.add('fade'));
  setTimeout(() => { try { path.remove(); } catch (e) {} }, 1500);
}
