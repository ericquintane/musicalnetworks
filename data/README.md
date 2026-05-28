# Bundled datasets

Each `data/*.json` is a preprocessed slice of a public dataset, in the schema:

```jsonc
{
  "name": "...",
  "description": "...",
  "credit": "...",   // please cite if you reuse a sonification
  "license": "...",
  "actors":   [{"id": "...", "name": "...", "group": "..."}],
  "events":   [{"time": 0.0, "sender": "...", "receiver": "...", "type": "...", "weight": 1}],
  "duration": 86380
}
```

To regenerate from the raw sources, place the raw files in `tmp_raw/` (paths
in `scripts/preprocess.py`) and run:

```sh
python3 scripts/preprocess.py
```

## Sources

| File                  | Source dataset                                                    | License            |
|-----------------------|-------------------------------------------------------------------|--------------------|
| `workplace.json`      | SocioPatterns Workplace (Génois & Barrat, EPJDS 7:11, 2018)       | CC0                |
| `hospital.json`       | SocioPatterns Hospital ward (Vanhems et al., PLoS ONE 8:e73970)   | CC BY-NC-SA 4.0    |
| `primary_school.json` | SocioPatterns Primary school (Stehlé et al., PLoS ONE 6:e23176)   | CC BY-NC-SA 4.0    |
| `eu_core.json`        | SNAP email-Eu-core-temporal (Paranjape et al., WSDM 2017)         | Free for academic use with citation |
| `radoslaw.json`       | Manufacturing email (Michalski, Palus & Kazienko, HCI 2011)       | Free for academic use with citation |

Each `data/*.json` carries its own `credit` and `license` strings; the app
shows them under the dataset selector.
