// Chord-diagram visualisation. One outer-ring arc per group, ribbons inside
// proportional to inter-group event counts. Aggregate view — no playback sync
// (animating ribbons on every event would be visually noisy on dense data).

import { colorsForActors } from './viz.js';

const NS = 'http://www.w3.org/2000/svg';
const SIZE = 400;

function attrValue(actor, key) {
  if (!actor || !key) return undefined;
  if (actor.attributes && key in actor.attributes) return actor.attributes[key];
  if (key === 'group') return actor.group;
  return undefined;
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

export function renderChord(svg, rem, colorKey, mutedValues = new Set()) {
  const { actors, events } = rem;
  const actorGroup = new Map(actors.map(a => [String(a.id), attrValue(a, colorKey)]));
  const groups = [...new Set([...actorGroup.values()].filter(v => v != null))].sort();
  const visibleGroups = groups.filter(g => !mutedValues.has(g));

  svg.setAttribute('viewBox', `${-SIZE / 2} ${-SIZE / 2} ${SIZE} ${SIZE}`);
  if (visibleGroups.length < 2) {
    svg.innerHTML = '<text x="0" y="0" text-anchor="middle" font-size="13" fill="#666">Need at least 2 groups for a chord diagram.</text>';
    return;
  }
  const idx = new Map(visibleGroups.map((g, i) => [g, i]));
  const n = visibleGroups.length;
  const M = Array.from({ length: n }, () => new Array(n).fill(0));

  for (const e of events) {
    const gi = actorGroup.get(String(e.sender));
    const gj = actorGroup.get(String(e.receiver));
    const i = idx.get(gi), j = idx.get(gj);
    if (i == null || j == null) continue;
    M[i][j] += 1;
  }

  const totals = visibleGroups.map((_, i) =>
    visibleGroups.reduce((s, _, j) => s + M[i][j] + M[j][i], 0));
  const grand = totals.reduce((a, b) => a + b, 0) || 1;

  const PAD = 0.025;
  const totalPad = PAD * n;
  const available = 2 * Math.PI - totalPad;

  let angle = -Math.PI / 2;
  const arcs = visibleGroups.map((g, i) => {
    const span = (totals[i] / grand) * available;
    const a = { group: g, start: angle, end: angle + span, span };
    angle = a.end + PAD;
    return a;
  });

  const outerR = SIZE / 2 - 50;
  const innerR = outerR - 14;

  // Subdivide each arc by destination groups (asymmetric: i→j segment is in i's arc).
  const segments = arcs.map((arc, i) => {
    const segs = new Array(n);
    let a = arc.start;
    for (let j = 0; j < n; j++) {
      const count = M[i][j] + M[j][i] * 0; // i's own outflow to j
      const span = totals[i] > 0 ? (count / totals[i]) * arc.span : 0;
      segs[j] = { start: a, end: a + span, count };
      a += span;
    }
    return segs;
  });

  const colors = colorsForActors(actors, colorKey);

  svg.innerHTML = `
    <g id="chord-ribbons"></g>
    <g id="chord-arcs"></g>
    <g id="chord-labels"></g>
  `;
  const ribbonsG = svg.querySelector('#chord-ribbons');
  const arcsG = svg.querySelector('#chord-arcs');
  const labelsG = svg.querySelector('#chord-labels');

  // Outer arcs and labels.
  arcs.forEach((arc, i) => {
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', arcPath(arc.start, arc.end, innerR, outerR));
    path.setAttribute('fill', colors.get(visibleGroups[i]) || '#888');
    arcsG.appendChild(path);

    const mid = (arc.start + arc.end) / 2;
    const lx = (outerR + 14) * Math.cos(mid);
    const ly = (outerR + 14) * Math.sin(mid);
    const text = document.createElementNS(NS, 'text');
    text.textContent = `${visibleGroups[i]} (${totals[i]})`;
    text.setAttribute('x', lx.toFixed(1));
    text.setAttribute('y', ly.toFixed(1));
    text.setAttribute('text-anchor', Math.cos(mid) > 0.1 ? 'start' : (Math.cos(mid) < -0.1 ? 'end' : 'middle'));
    text.setAttribute('dy', '0.35em');
    text.setAttribute('font-size', '11');
    text.setAttribute('fill', '#222');
    labelsG.appendChild(text);
  });

  // Ribbons.
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const segA = segments[i][j];
      const segB = segments[j][i];
      if (segA.count + segB.count === 0) continue;

      const r = innerR - 1;
      const p1 = polar(segA.start, r);
      const p2 = polar(segA.end, r);
      const p3 = polar(segB.start, r);
      const p4 = polar(segB.end, r);
      const d =
        `M ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} ` +
        `A ${r} ${r} 0 0 1 ${p2.x.toFixed(1)} ${p2.y.toFixed(1)} ` +
        `Q 0 0 ${p3.x.toFixed(1)} ${p3.y.toFixed(1)} ` +
        `A ${r} ${r} 0 0 1 ${p4.x.toFixed(1)} ${p4.y.toFixed(1)} ` +
        `Q 0 0 ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} Z`;
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', d);
      const colorIdx = totals[i] >= totals[j] ? i : j;
      path.setAttribute('fill', colors.get(visibleGroups[colorIdx]) || '#888');
      path.setAttribute('opacity', '0.45');
      const label = i === j
        ? `${visibleGroups[i]} ↔ ${visibleGroups[i]} (within-group): ${segA.count}`
        : `${visibleGroups[i]} ↔ ${visibleGroups[j]}: ${segA.count + segB.count}`;
      const title = document.createElementNS(NS, 'title');
      title.textContent = label;
      path.appendChild(title);
      ribbonsG.appendChild(path);
    }
  }
}
