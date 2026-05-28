// Synthetic REM generator and CSV parser.
//
// REM event schema: { time:Number, sender:Id, receiver:Id, type:String, weight:Number }
// Dataset schema:   { actors:[{id,name,group}], events:[event], duration:Number }

function makeRng(seed) {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function generateSyntheticREM({
  nActors = 8,
  nEvents = 120,
  duration = 30,
  seed = Math.floor(Math.random() * 1e9),
} = {}) {
  const rand = makeRng(seed);

  // Actors: split into two groups with one broker in the middle.
  const half = Math.floor(nActors / 2);
  const actors = [];
  for (let i = 0; i < nActors; i++) {
    let group;
    if (i === half) group = 'broker';
    else if (i < half) group = 'A';
    else group = 'B';
    actors.push({ id: i, name: `${group === 'broker' ? 'Broker' : 'A'+(i+1)}`, group });
  }
  // Re-label B group properly
  let bi = 1;
  for (const a of actors) {
    if (a.group === 'B') { a.name = `B${bi++}`; }
    else if (a.group === 'A') { a.name = `A${a.id+1}`; }
  }

  const types = ['message', 'meeting', 'mention'];
  const events = [];
  let t = 0;

  while (events.length < nEvents) {
    // Bursty inter-event time: occasional dense periods, otherwise sparse.
    const burst = rand() < 0.18;
    const lambda = burst ? 5.0 : 1.2;
    t += -Math.log(1 - rand()) / lambda;
    if (t > duration) break;

    const sender = actors[Math.floor(rand() * actors.length)];

    let receiver;
    if (sender.group === 'broker') {
      do { receiver = actors[Math.floor(rand() * actors.length)]; }
      while (receiver.id === sender.id);
    } else if (rand() < 0.7) {
      // Within group.
      const sameGroup = actors.filter(a => a.group === sender.group && a.id !== sender.id);
      receiver = sameGroup[Math.floor(rand() * sameGroup.length)];
    } else {
      // Cross-group, usually via broker.
      if (rand() < 0.6) {
        receiver = actors.find(a => a.group === 'broker');
      } else {
        const otherGroup = actors.filter(a => a.group !== sender.group && a.group !== 'broker');
        receiver = otherGroup[Math.floor(rand() * otherGroup.length)] || actors.find(a => a.group === 'broker');
      }
    }
    if (!receiver || receiver.id === sender.id) continue;

    const type = types[Math.floor(rand() * types.length)];

    events.push({
      time: t,
      sender: sender.id,
      receiver: receiver.id,
      type,
      weight: 1 + Math.floor(rand() * 3),
    });

    // Reciprocity: ~30% chance of a quick reply.
    if (rand() < 0.3 && events.length < nEvents) {
      events.push({
        time: t + 0.05 + rand() * 0.4,
        sender: receiver.id,
        receiver: sender.id,
        type,
        weight: 1 + Math.floor(rand() * 2),
      });
    }
  }

  events.sort((a, b) => a.time - b.time);
  return { actors, events, duration };
}

export function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error('CSV looks empty.');

  const header = lines[0].split(',').map(s => s.trim().toLowerCase().replace(/^"|"$/g, ''));
  const idx = {
    time: header.indexOf('time'),
    sender: header.indexOf('sender'),
    receiver: header.indexOf('receiver'),
    type: header.indexOf('type'),
    weight: header.indexOf('weight'),
  };
  if (idx.time < 0 || idx.sender < 0 || idx.receiver < 0) {
    throw new Error('CSV must include columns: time, sender, receiver.');
  }

  const events = [];
  const actorIds = new Set();
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(s => s.trim().replace(/^"|"$/g, ''));
    const time = parseFloat(cols[idx.time]);
    if (!Number.isFinite(time)) continue;
    const ev = {
      time,
      sender: cols[idx.sender],
      receiver: cols[idx.receiver],
      type: idx.type >= 0 ? (cols[idx.type] || 'event') : 'event',
      weight: idx.weight >= 0 ? (parseFloat(cols[idx.weight]) || 1) : 1,
    };
    actorIds.add(ev.sender);
    actorIds.add(ev.receiver);
    events.push(ev);
  }

  events.sort((a, b) => a.time - b.time);
  const tMin = events[0]?.time ?? 0;
  const tMax = events[events.length - 1]?.time ?? 0;
  const shifted = events.map(e => ({ ...e, time: e.time - tMin }));
  const duration = tMax - tMin || 1;

  // No group info available from CSV, so alternate A/B for visual variety.
  const actors = Array.from(actorIds).map((id, i) => ({
    id,
    name: String(id),
    group: i % 3 === 0 ? 'broker' : (i % 2 === 1 ? 'A' : 'B'),
  }));

  return { actors, events: shifted, duration };
}
