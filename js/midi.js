// MIDI export. Loads @tonejs/midi from CDN as window.Midi.
//
// Each instrument preset maps to a General MIDI program (for tonal voices) or
// a GM drum note on channel 10 (for percussion). Downloading a .mid lets users
// take a piece into Ableton/Logic/Reaper for further work.

const GM_DRUM_NOTE = {
  kick: 36,       // Bass Drum 1
  snare: 38,      // Acoustic Snare
  hat: 42,        // Closed Hi-Hat
  tom: 47,        // Low-Mid Tom
  conga: 63,      // Open Hi Conga
  woodblock: 76,  // Hi Wood Block
};

const GM_PROGRAM = {
  string: 48,  // String Ensemble 1
  pad: 88,     // Pad 1 (new age)
  pluck: 24,   // Acoustic Guitar (nylon)
  lead: 80,    // Lead 1 (square)
  bass: 32,    // Acoustic Bass
  bell: 14,    // Tubular Bells
  piano: 0,    // Acoustic Grand Piano
  drone: 94,   // Pad 7 (halo)
};

export function exportMIDI(musicalEvents, style, filename = 'musicalnetworks.mid') {
  const Midi = window.Midi;
  if (!Midi) throw new Error('@tonejs/midi did not load.');
  if (!musicalEvents.length) throw new Error('No events to export.');

  const midi = new Midi();
  midi.header.setTempo(style.bpm || 90);

  // One track per instrument preset for clean DAW import.
  const tracks = new Map();
  for (const ev of musicalEvents) {
    const preset = ev.instrument.preset;
    let track = tracks.get(preset);
    if (!track) {
      track = midi.addTrack();
      track.name = preset;
      const drumNote = GM_DRUM_NOTE[preset];
      if (drumNote != null) {
        track.channel = 9; // GM percussion channel (0-indexed)
      } else {
        const program = GM_PROGRAM[preset];
        if (program != null) track.instrument.number = program;
      }
      tracks.set(preset, track);
    }

    const drumNote = GM_DRUM_NOTE[preset];
    if (drumNote != null) {
      track.addNote({
        midi: drumNote,
        time: ev.time,
        duration: 0.05,
        velocity: ev.velocity,
      });
    } else {
      track.addNote({
        midi: ev.senderPitch,
        time: ev.time,
        duration: ev.duration,
        velocity: ev.velocity,
      });
      if (ev.receiverPitch !== ev.senderPitch) {
        track.addNote({
          midi: ev.receiverPitch,
          time: ev.time,
          duration: ev.duration,
          velocity: ev.velocity,
        });
      }
    }
  }

  const data = midi.toArray();
  const blob = new Blob([data], { type: 'audio/midi' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
