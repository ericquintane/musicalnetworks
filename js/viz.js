// SVG network visualisation, synced to playback by app.js.
//
// renderNetwork(svg, actors)        -> lay out nodes in a circle
// flashEvent(svg, senderId, recvId) -> highlight both nodes and draw a fading arc

const NS = 'http://www.w3.org/2000/svg';
const SIZE = 400;

let positions = new Map();

function radiusFor(n) {
  // Shrink slightly for huge networks so labels still fit.
  if (n > 200) return 160;
  if (n > 100) return 165;
  return 150;
}

function nodeRadiusFor(n) {
  if (n > 200) return 4;
  if (n > 100) return 6;
  if (n > 50)  return 10;
  return 14;
}

function fontSizeFor(n) {
  if (n > 200) return 0;   // hide labels entirely on dense networks
  if (n > 100) return 7;
  if (n > 50)  return 9;
  return 11;
}

function layout(actors) {
  const m = new Map();
  const n = actors.length || 1;
  const r = radiusFor(n);
  const cx = SIZE / 2, cy = SIZE / 2;
  actors.forEach((a, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
    m.set(String(a.id), {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    });
  });
  return m;
}

function attrValue(actor, key) {
  if (!actor || !key) return undefined;
  if (actor.attributes && key in actor.attributes) return actor.attributes[key];
  if (key === 'group') return actor.group;
  return undefined;
}

// Assign each unique value of `colorKey` a distinct HSL color.
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

export function renderNetwork(svg, actors, colorKey = 'group', mutedValues = new Set()) {
  positions = layout(actors);
  const colors = buildColors(actors, colorKey);
  const nodeR = nodeRadiusFor(actors.length);
  const fontSize = fontSizeFor(actors.length);

  svg.setAttribute('viewBox', `0 0 ${SIZE} ${SIZE}`);
  svg.innerHTML = '<g id="viz-edges"></g><g id="viz-nodes"></g>';
  const nodes = svg.querySelector('#viz-nodes');

  for (const a of actors) {
    const pos = positions.get(String(a.id));
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('transform', `translate(${pos.x.toFixed(1)}, ${pos.y.toFixed(1)})`);
    g.setAttribute('data-id', String(a.id));
    g.setAttribute('class', 'viz-node');

    const value = attrValue(a, colorKey) ?? 'default';
    const isMuted = mutedValues.has(value);

    const circle = document.createElementNS(NS, 'circle');
    circle.setAttribute('r', String(nodeR));
    circle.setAttribute('fill', colors.get(value) || '#888');
    circle.setAttribute('opacity', isMuted ? '0.2' : '1');
    circle.setAttribute('data-base-r', String(nodeR));
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

    nodes.appendChild(g);
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
  svg.querySelector('#viz-edges').appendChild(path);

  requestAnimationFrame(() => path.classList.add('fade'));
  setTimeout(() => { try { path.remove(); } catch (e) {} }, 1500);
}
