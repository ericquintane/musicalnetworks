#!/usr/bin/env python3
"""Convert raw public datasets into JSON files the musicalnetworks app loads.

Each output `data/<name>.json` has the shape:
{
  "name": "...",
  "description": "...",
  "credit": "...",
  "license": "...",
  "attributes": ["department", ...],   # ordered list of attribute keys present on actors
  "actors":  [{"id": "...", "name": "...", "group": "...", "attributes": {"k": "v", ...}}],
  "events":  [{"time": float, "sender": "id", "receiver": "id", "type": "...", "weight": int}],
  "duration": float
}

`group` is kept as the primary categorical attribute (mirrors attributes[0])
for back-compatibility with code that still reads it directly.

Run from the project root:
    python3 scripts/preprocess.py
"""
import gzip
import json
import zipfile
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "tmp_raw"
OUT = ROOT / "data"
OUT.mkdir(exist_ok=True)


def write_dataset(name, info, attributes, actors, events):
    events = sorted(events, key=lambda e: e["time"])
    if not events:
        print(f"  {name}: skipped (no events)")
        return
    t0 = events[0]["time"]
    for e in events:
        e["time"] = round(e["time"] - t0, 3)
    duration = events[-1]["time"]
    out = {
        "name": info["name"],
        "description": info["description"],
        "credit": info["credit"],
        "license": info["license"],
        "attributes": attributes,
        "actors": actors,
        "events": events,
        "duration": duration,
    }
    path = OUT / f"{name}.json"
    with open(path, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"  {name}.json: {len(actors)} actors, {len(events)} events, "
          f"dur={duration:.0f}s, size={path.stat().st_size // 1024}KB, attrs={attributes}")


def busiest_day_events(events, seconds_per_day=86400):
    by_day = Counter()
    for e in events:
        by_day[int(e["time"] // seconds_per_day)] += 1
    busy = by_day.most_common(1)[0][0]
    return [e for e in events if int(e["time"] // seconds_per_day) == busy], busy


# ---------------------------------------------------------------- workplace
def workplace():
    print("workplace")
    actor_dept = {}
    with open(RAW / "workplace_metadata.txt") as f:
        for line in f:
            parts = line.strip().split("\t")
            if len(parts) >= 2:
                actor_dept[parts[0]] = parts[1]

    events = []
    with zipfile.ZipFile(RAW / "workplace_tij.zip") as zf:
        for nm in zf.namelist():
            if nm.endswith("/"):
                continue
            for raw in zf.open(nm):
                parts = raw.decode().strip().split()
                if len(parts) >= 3:
                    t = int(parts[0])
                    events.append({
                        "time": float(t),
                        "sender": parts[1],
                        "receiver": parts[2],
                        "type": "contact",
                        "weight": 1,
                    })

    events, _ = busiest_day_events(events)
    present = {e["sender"] for e in events} | {e["receiver"] for e in events}
    actors = []
    for a in sorted(present):
        if a not in actor_dept:
            continue
        dept = actor_dept[a]
        actors.append({
            "id": a, "name": f"{dept}-{a}", "group": dept,
            "attributes": {"department": dept},
        })
    known = {a["id"] for a in actors}
    events = [e for e in events if e["sender"] in known and e["receiver"] in known]

    write_dataset("workplace", {
        "name": "Workplace (Génois & Barrat 2018)",
        "description": "One day of face-to-face contacts at a French office. Five departments.",
        "credit": "Génois & Barrat, EPJ Data Science 7, 11 (2018). SocioPatterns.",
        "license": "CC0 (Public Domain Dedication).",
    }, ["department"], actors, events)


# ----------------------------------------------------------------- hospital
def hospital():
    print("hospital")
    events = []
    actor_role = {}
    with gzip.open(RAW / "hospital_contacts.dat.gz", "rt") as f:
        for line in f:
            parts = line.strip().split("\t")
            if len(parts) >= 5:
                t, i, j, si, sj = parts[:5]
                events.append({
                    "time": float(t),
                    "sender": i,
                    "receiver": j,
                    "type": si,
                    "weight": 1,
                })
                actor_role[i] = si
                actor_role[j] = sj

    events, _ = busiest_day_events(events)
    present = {e["sender"] for e in events} | {e["receiver"] for e in events}
    # Crude hierarchy rank for ordinal mappings (mode).
    rank = {"PAT": "1-patient", "NUR": "2-nurse", "MED": "3-doctor", "ADM": "4-admin"}
    actors = []
    for a in sorted(present):
        role = actor_role.get(a, "?")
        actors.append({
            "id": a, "name": f"{role}-{a}", "group": role,
            "attributes": {"role": role, "rank": rank.get(role, "?")},
        })

    write_dataset("hospital", {
        "name": "Hospital ward (Vanhems et al. 2013)",
        "description": "One busy day on a hospital ward. Patients, nurses, doctors, admin.",
        "credit": "Vanhems et al., PLoS ONE 8(9), e73970 (2013). SocioPatterns.",
        "license": "CC BY-NC-SA 4.0.",
    }, ["role", "rank"], actors, events)


# ------------------------------------------------------------ primary school
def primary_school():
    print("primary school")
    # Metadata has both class and gender — leverage both as attributes.
    actor_class = {}
    actor_gender = {}
    with open(RAW / "primaryschool_metadata.txt") as f:
        for line in f:
            parts = line.strip().split("\t")
            if len(parts) >= 3:
                actor_class[parts[0]] = parts[1]
                actor_gender[parts[0]] = parts[2]

    events_all = []
    with gzip.open(RAW / "primaryschool.csv.gz", "rt") as f:
        for line in f:
            parts = line.strip().split("\t")
            if len(parts) >= 5:
                t, i, j, ci, cj = parts[:5]
                events_all.append({
                    "time": float(t),
                    "sender": i,
                    "receiver": j,
                    "type": "same-class" if ci == cj else "cross-class",
                    "weight": 1,
                    "_ci": ci,
                    "_cj": cj,
                })

    # Keep only events between 5A and 5B students (10-year-olds).
    keep_classes = {"5A", "5B"}
    events = [
        {"time": e["time"], "sender": e["sender"], "receiver": e["receiver"],
         "type": e["type"], "weight": e["weight"]}
        for e in events_all
        if e["_ci"] in keep_classes and e["_cj"] in keep_classes
    ]

    present = {e["sender"] for e in events} | {e["receiver"] for e in events}
    actors = []
    for a in sorted(present):
        cl = actor_class.get(a, "?")
        gn = actor_gender.get(a, "?")
        actors.append({
            "id": a, "name": f"{cl}-{a}", "group": cl,
            "attributes": {"class": cl, "gender": gn},
        })

    write_dataset("primary_school", {
        "name": "Primary school (Stehlé et al. 2011)",
        "description": "Contacts between 5th-grade students (classes 5A and 5B) over one school day.",
        "credit": "Stehlé et al., PLoS ONE 6(8): e23176 (2011); Gemmetto et al. BMC Inf. Dis. 2014. SocioPatterns.",
        "license": "CC BY-NC-SA 4.0.",
    }, ["class", "gender"], actors, events)


# ------------------------------------------------------------- Eu-core email
def eu_core():
    print("eu-core")
    actor_dept = {}
    with gzip.open(RAW / "email-Eu-core-department-labels.txt.gz", "rt") as f:
        for line in f:
            parts = line.strip().split()
            if len(parts) >= 2:
                actor_dept[parts[0]] = parts[1]

    events = []
    with gzip.open(RAW / "email-Eu-core-temporal.txt.gz", "rt") as f:
        for line in f:
            parts = line.strip().split()
            if len(parts) >= 3:
                s, r, t = parts[:3]
                events.append({
                    "time": float(t),
                    "sender": s,
                    "receiver": r,
                    "type": "email",
                    "weight": 1,
                })
    events = sorted(events, key=lambda e: e["time"])[:2500]

    present = sorted({e["sender"] for e in events} | {e["receiver"] for e in events}, key=int)
    actors = []
    for a in present:
        dept = actor_dept.get(a, "?")
        actors.append({
            "id": a, "name": f"d{dept}-{a}", "group": f"dept{dept}",
            "attributes": {"department": f"dept{dept}"},
        })

    write_dataset("eu_core", {
        "name": "EU research-institution emails (Paranjape et al. 2017)",
        "description": "A ~2-month slice of email at a large European research institution. Groups are departments.",
        "credit": "Paranjape, Benson & Leskovec, WSDM 2017. SNAP.",
        "license": "Free for academic use with citation.",
    }, ["department"], actors, events)


# ----------------------------------------------------------------- Radoslaw
def radoslaw():
    print("radoslaw")
    events = []
    with zipfile.ZipFile(RAW / "ia-radoslaw-email.zip") as zf:
        with zf.open("ia-radoslaw-email.edges") as f:
            for raw in f:
                line = raw.decode().strip()
                if not line or line.startswith("%"):
                    continue
                parts = line.split()
                if len(parts) >= 4:
                    i, j, w, t = parts[:4]
                    events.append({
                        "time": float(t),
                        "sender": i,
                        "receiver": j,
                        "type": "email",
                        "weight": int(w),
                    })

    events.sort(key=lambda e: e["time"])
    if events:
        t0 = events[0]["time"]
        day_of = [(e, int((e["time"] - t0) // 86400)) for e in events]
        per_day = Counter(d for _, d in day_of)
        max_day = day_of[-1][1]
        best_start, best_count = 0, 0
        for start in range(max(0, max_day - 30 + 1)):
            cnt = sum(per_day[d] for d in range(start, start + 30))
            if cnt > best_count:
                best_count, best_start = cnt, start
        events = [e for e, d in day_of if best_start <= d < best_start + 30]

    activity = Counter()
    for e in events:
        activity[e["sender"]] += 1
        activity[e["receiver"]] += 1
    top_actors = {a for a, _ in activity.most_common(80)}
    events = [e for e in events if e["sender"] in top_actors and e["receiver"] in top_actors]

    present = sorted({e["sender"] for e in events} | {e["receiver"] for e in events}, key=int)
    sorted_by_activity = sorted(present, key=lambda a: -activity[a])
    third = max(1, len(sorted_by_activity) // 3)
    high = set(sorted_by_activity[:third])
    low = set(sorted_by_activity[-third:])
    actors = []
    for a in present:
        if a in high:
            quartile = "1-high"
        elif a in low:
            quartile = "3-low"
        else:
            quartile = "2-mid"
        actors.append({
            "id": a, "name": a, "group": quartile,
            "attributes": {"activity": quartile},
        })

    write_dataset("radoslaw", {
        "name": "Manufacturing email (Michalski et al. 2011)",
        "description": "One busy month of internal email at a mid-sized European manufacturing company. "
                       "Used as an Enron-like substitute: small, fully temporal, and openly redistributable. "
                       "Actor groups are by activity quartile (high / mid / low) since the dataset has no department metadata.",
        "credit": "Michalski, Palus & Kazienko, HCI 2011. Network Repository.",
        "license": "Free for academic use with citation.",
    }, ["activity"], actors, events)


if __name__ == "__main__":
    workplace()
    hospital()
    primary_school()
    eu_core()
    radoslaw()
