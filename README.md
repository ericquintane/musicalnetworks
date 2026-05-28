# musicalnetworks

Turn a relational event sequence into music, in the browser.

Live demo: **https://www.quintane.net/musicalnetworks/** (also reachable at https://ericquintane.github.io/musicalnetworks/)

A relational event has the form `(time, sender, receiver, type)`: who did what to whom, and when. This app maps those events to musical events: each actor gets a pitch in a chosen scale, each event plays the sender's note answered by the receiver's note as a harmonic interval, and event types pick the instrument. Bursts in the data become flurries; lulls become rests.

## Features

- Six style presets: **Chamber**, **Electronic**, **Ambient**, **Percussive / world**, **Jazz**, **Drone**.
- Real-time playback with synced network visualisation: nodes pulse and arcs flash for each event.
- Synthetic REM generator with bursty timing, two groups, and a broker.
- CSV upload for your own data.
- MIDI export to take a piece into Ableton, Logic, Reaper, etc.
- R helpers for piping REM data straight from your R workflow.

## Run locally

ES modules need to be served over HTTP, not opened from disk. From the project root:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

## CSV format

Upload a CSV with columns `time, sender, receiver`, and optionally `type` and `weight`. Times can be any numeric scale; the app rescales them to the chosen musical duration. Senders and receivers can be any string ids.

```csv
time,sender,receiver,type,weight
0.0,alice,bob,message,1
0.3,bob,alice,message,2
1.8,bob,carol,meeting,1
```

## R helpers

[R/musicalnetworks.R](R/musicalnetworks.R) provides:

- `write_rem_csv(events, file)` writes a generic REM data.frame to a CSV the app reads.
- `write_relevent_csv(edgelist, file)` converts a `relevent::rem.dyad`-style edgelist.

```r
source("R/musicalnetworks.R")
write_rem_csv(my_events, "events.csv")
```

## Mapping

| REM element     | Musical mapping                                  |
|-----------------|--------------------------------------------------|
| Event time      | Note onset (rescaled, optionally quantized)      |
| Sender id       | Pitch from the style's scale (group register)    |
| Receiver id     | Second pitch, played as an interval with sender  |
| Event type      | Instrument (or drum, in percussive style)        |
| Weight          | Velocity (loudness)                              |
| Group attribute | Octave register (A low, broker middle, B high)   |

Each style is a JSON bundle of these parameters in [js/styles.js](js/styles.js). To add a new style, define a scale, instruments per event type, tempo, and quantization. The available instrument presets are in [js/player.js](js/player.js).

## MIDI export

The Download MIDI button produces a multi-track Standard MIDI File: one track per instrument preset, with reasonable General MIDI program assignments, and percussion on channel 10. Open it in any DAW for further work.

## File layout

```
index.html         UI
style.css          styling
js/app.js          wires UI to logic
js/data.js         synthetic REM generator + CSV parser
js/styles.js       style presets
js/mapping.js      REM events -> musical events
js/player.js       Tone.js scheduling and playback
js/viz.js          SVG network visualisation
js/midi.js         MIDI export
R/musicalnetworks.R  R helpers for exporting REM data
```

## Deploy

The app is static (HTML + CSS + JS, no build step). Already deployed via GitHub Pages from this repo. To deploy your own fork:

- Push to a public GitHub repo.
- Enable Pages in repo settings, source: `main` branch root.

## Built with

[Tone.js](https://tonejs.github.io/) for Web Audio synthesis and [@tonejs/midi](https://github.com/Tonejs/Midi) for MIDI export. Both loaded from CDN; no build step required.
