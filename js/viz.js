// SVG network visualisation, synced to playback by app.js.
//
// renderNetwork(svg, actors)        -> lay out nodes in a circle
// flashEvent(svg, senderId, recvId) -> highlight both nodes and draw a fading arc

const NS = 'http://www.w3.org/2000/svg';
const SIZE = 400;
const RADIUS = 150;

let positions = new Map();

function layout(actors) {
  const m = new Map();
  const n = actors.length || 1;
  const cx = SIZE / 2, cy = SIZE / 2;
  actors.forEach((a, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
    m.set(String(a.id), {
      x: cx + RADIUS * Math.cos(angle),
      y: cy + RADIUS * Math.sin(angle),
    });
  });
  return m;
}

export function renderNetwork(svg, actors) {
  positions = layout(actors);
  svg.setAttribute('viewBox', `0 0 ${SIZE} ${SIZE}`);
  svg.innerHTML = '<g id="viz-edges"></g><g id="viz-nodes"></g>';
  const nodes = svg.querySelector('#viz-nodes');

  for (const a of actors) {
    const pos = positions.get(String(a.id));
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('transform', `translate(${pos.x.toFixed(1)}, ${pos.y.toFixed(1)})`);
    g.setAttribute('data-id', String(a.id));
    g.setAttribute('class', `viz-node group-${a.group}`);

    const circle = document.createElementNS(NS, 'circle');
    circle.setAttribute('r', '14');
    g.appendChild(circle);

    const text = document.createElementNS(NS, 'text');
    text.textContent = a.name;
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dy', '0.35em');
    g.appendChild(text);

    nodes.appendChild(g);
  }
}

export function flashEvent(svg, senderId, receiverId) {
  const a = positions.get(String(senderId));
  const b = positions.get(String(receiverId));
  if (!a || !b) return;

  // Pulse the sender and receiver nodes.
  svg.querySelectorAll('.viz-node').forEach(g => {
    if (g.dataset.id === String(senderId) || g.dataset.id === String(receiverId)) {
      g.classList.add('active');
      clearTimeout(g._t);
      g._t = setTimeout(() => g.classList.remove('active'), 400);
    }
  });

  // Draw an arc from sender to receiver that fades out.
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
