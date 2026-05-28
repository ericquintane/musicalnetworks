// Style presets. Each preset is a JSON-serializable bundle of mapping parameters.
//
// Adding a new style: pick a scale, choose instrument presets per event type,
// set tempo, octave spread, and quantization. Available instrument presets
// are defined in player.js (string, pad, pluck, lead, bass, bell, piano, drone,
// kick, snare, hat, tom, conga, woodblock).

const SCALES = {
  cMajor:           [0, 2, 4, 5, 7, 9, 11],
  aMinorPentatonic: [0, 3, 5, 7, 10],
  dDorian:          [0, 2, 3, 5, 7, 9, 10],
  bluesMinor:       [0, 3, 5, 6, 7, 10],
  chromatic:        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

export const STYLES = {
  chamber: {
    name: 'Chamber',
    description: 'Plucked and bowed voices in C major. Polyphonic, gently quantized.',
    scale: SCALES.cMajor,
    rootMidi: 60,
    octaveSpread: 1,
    durationSeconds: 90,
    quantize: 0.25,
    bpm: 90,
    instruments: {
      message: { preset: 'string' },
      meeting: { preset: 'pad' },
      mention: { preset: 'pluck' },
      default: { preset: 'string' },
    },
  },
  electronic: {
    name: 'Electronic',
    description: 'A minor pentatonic on synths. Hard quantized to 16ths.',
    scale: SCALES.aMinorPentatonic,
    rootMidi: 57,
    octaveSpread: 1,
    durationSeconds: 60,
    quantize: 0.125,
    bpm: 120,
    instruments: {
      message: { preset: 'lead' },
      meeting: { preset: 'bass' },
      mention: { preset: 'hat' },
      default: { preset: 'lead' },
    },
  },
  ambient: {
    name: 'Ambient',
    description: 'Slow Dorian pads. No quantization, long sustains.',
    scale: SCALES.dDorian,
    rootMidi: 62,
    octaveSpread: 1,
    durationSeconds: 150,
    quantize: 0,
    bpm: 60,
    noteDuration: 4.0,
    instruments: {
      message: { preset: 'pad' },
      meeting: { preset: 'pad' },
      mention: { preset: 'bell' },
      default: { preset: 'pad' },
    },
  },
  percussive: {
    name: 'Percussive / world',
    description: 'No pitch. Event types pick a drum, weight sets the strike intensity.',
    scale: SCALES.cMajor,
    rootMidi: 60,
    octaveSpread: 0,
    durationSeconds: 60,
    quantize: 0.125,
    bpm: 110,
    instruments: {
      message: { preset: 'kick' },
      meeting: { preset: 'snare' },
      mention: { preset: 'hat' },
      default: { preset: 'conga' },
    },
  },
  jazz: {
    name: 'Jazz',
    description: 'Blues-minor scale on piano with walking bass. Lightly quantized.',
    scale: SCALES.bluesMinor,
    rootMidi: 58,
    octaveSpread: 1,
    durationSeconds: 75,
    quantize: 0.166666, // approximately a triplet 8th feel at 120bpm
    bpm: 100,
    instruments: {
      message: { preset: 'piano' },
      meeting: { preset: 'bass' },
      mention: { preset: 'woodblock' },
      default: { preset: 'piano' },
    },
  },
  drone: {
    name: 'Drone',
    description: 'Long sustained sawtooth tones. Chromatic, no quantization. Spectral and slow.',
    scale: SCALES.chromatic,
    rootMidi: 48,
    octaveSpread: 2,
    durationSeconds: 240,
    quantize: 0,
    bpm: 40,
    noteDuration: 12.0,
    instruments: {
      message: { preset: 'drone' },
      meeting: { preset: 'drone' },
      mention: { preset: 'bell' },
      default: { preset: 'drone' },
    },
  },
};
