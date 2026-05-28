#!/usr/bin/env python3
"""Convert raw public datasets into JSON files the musicalnetworks app loads.

Each output `data/<name>.json` has the shape:
{
  "name": "...",
  "description": "...",
  "credit": "...",
  "license": "...",
  "actors":   [{"id": "...", "name": "...", "group": "..."}, ...],
  "events":   [{"time": float, "sender": "id", "receiver": "id", "type": "...", "weight": int}, ...],
  "duration": float
}

Run from the project root:
    python3 scripts/preprocess.py
"""
import gzip
import io
import json
import random
import sys
import zipfile
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "tmp_raw"
OUT = ROOT / "data"
OUT.mkdir(exist_ok=True)


def write_dataset(name, info, actors, events):
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
        "actors": actors,
        "events": events,
        "duration": duration,
    }
    path = OUT / f"{name}.json"
    with open(path, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"  {name}.json: {len(actors)} actors, {len(events)} events, "
          f"dur={duration:.0f}s, size={path.stat().st_size // 1024}KB")


def busiest_day_events(events, seconds_per_day=86400):
    by_day = Counter()
    for e in events:
        by_day[int(e["time"] // seconds_per_day)] += 1
    busy = by_day.most_common(1)[0][0]
    return [e for e in events if int(e["time"] // seconds_per_day) == busy], busy


# ---------------------------------------------------------------- workplace
def workplace():
    print("workplace")
    actors_by_id = {}
    with open(RAW / "workplace_metadata.txt") as f:
        for line in f:
            parts = line.strip().split("\t")
            if len(parts) >= 2:
                pid, dept = parts[0], parts[1]
                actors_by_id[pid] = {"id": pid, "name": f"{dept}-{pid}", "group": dept}

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

    events, day = busiest_day_events(events)
    present = {e["sender"] for e in events} | {e["receiver"] for e in events}
    actors = [actors_by_id[a] for a in sorted(present) if a in actors_by_id]
    known = {a["id"] for a in actors}
    events = [e for e in events if e["sender"] in known and e["receiver"] in known]

    write_dataset("workplace", {
        "name": "Workplace (Génois & Barrat 2018)",
        "description": "One day of face-to-face contacts at a French office. Five departments.",
        "credit": "Génois & Barrat, EPJ Data Science 7, 11 (2018). SocioPatterns.",
        "license": "CC0 (Public Domain Dedication).",
    }, actors, events)


# ----------------------------------------------------------------- hospital
def hospital():
    print("hospital")
    events = []
    actor_roles = {}
    with gzip.open(RAW / "hospital_contacts.dat.gz", "rt") as f:
        for line in f:
            parts = line.strip().split("\t")
            if len(parts) >= 5:
                t, i, j, si, sj = parts[:5]
                events.append({
                    "time": float(t),
                    "sender": i,
                    "receiver": j,
                    "type": si,        # role of the sender drives instrument variation
                    "weight": 1,
                })
                actor_roles[i] = si
                actor_roles[j] = sj

    events, day = busiest_day_events(events)
    present = {e["sender"] for e in events} | {e["receiver"] for e in events}
    actors = [
        {"id": a, "name": f"{actor_roles.get(a,'?')}-{a}", "group": actor_roles.get(a, "?")}
        for a in sorted(present)
    ]

    write_dataset("hospital", {
        "name": "Hospital ward (Vanhems et al. 2013)",
        "description": "One busy day on a hospital ward. Patients, nurses, doctors, admin.",
        "credit": "Vanhems et al., PLoS ONE 8(9), e73970 (2013). SocioPatterns.",
        "license": "CC BY-NC-SA 4.0.",
    }, actors, events)


# ------------------------------------------------------------ primary school
def primary_school():
    print("primary school")
    events_all = []
    actor_classes = {}
    with gzip.open(RAW / "primaryschool.csv.gz", "rt") as f:
        for line in f:
            parts = line.strip().split("\t")
            if len(parts) >= 5:
                t, i, j, ci, cj = parts[:5]
                events_all.append({
                    "time": float(t),
                    "sender": i,
                    "receiver": j,
                    "type": "contact",
                    "weight": 1,
                    "_ci": ci,
                    "_cj": cj,
                })
                actor_classes[i] = ci
                actor_classes[j] = cj

    # Keep only events between students in classes 5A and 5B (the 10-year-olds, ~46 kids).
    keep_classes = {"5A", "5B"}
    events = []
    for e in events_all:
        if e["_ci"] in keep_classes and e["_cj"] in keep_classes:
            events.append({
                "time": e["time"],
                "sender": e["sender"],
                "receiver": e["receiver"],
                "type": "same-class" if e["_ci"] == e["_cj"] else "cross-class",
                "weight": 1,
            })

    present = {e["sender"] for e in events} | {e["receiver"] for e in events}
    actors = [
        {"id": a, "name": f"{actor_classes.get(a,'?')}-{a}", "group": actor_classes.get(a, "?")}
        for a in sorted(present)
    ]

    write_dataset("primary_school", {
        "name": "Primary school (Stehlé et al. 2011)",
        "description": "Contacts between 5th-grade students (classes 5A and 5B) over one school day.",
        "credit": "Stehlé et al., PLoS ONE 6(8): e23176 (2011); Gemmetto et al. BMC Inf. Dis. 2014. SocioPatterns.",
        "license": "CC BY-NC-SA 4.0.",
    }, actors, events)


# ------------------------------------------------------------- Eu-core email
def eu_core():
    print("eu-core")
    labels = {}
    with gzip.open(RAW / "email-Eu-core-department-labels.txt.gz", "rt") as f:
        for line in f:
            parts = line.strip().split()
            if len(parts) >= 2:
                labels[parts[0]] = parts[1]

    # Original spans ~803 days, 332k events. Take the first 2500 events: gives a
    # ~2-month slice and stays well under the bundle-size budget.
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

    present = {e["sender"] for e in events} | {e["receiver"] for e in events}
    actors = [
        {"id": a, "name": f"d{labels.get(a,'?')}-{a}", "group": f"dept{labels.get(a, '?')}"}
        for a in sorted(present, key=int)
    ]

    write_dataset("eu_core", {
        "name": "EU research-institution emails (Paranjape et al. 2017)",
        "description": "A ~2-month slice of email at a large European research institution. Groups are departments.",
        "credit": "Paranjape, Benson & Leskovec, WSDM 2017. SNAP.",
        "license": "Free for academic use with citation.",
    }, actors, events)


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

    # Pick the busiest 30-day window.
    events.sort(key=lambda e: e["time"])
    if events:
        t0 = events[0]["time"]
        day_of = [(e, int((e["time"] - t0) // 86400)) for e in events]
        max_day = day_of[-1][1]
        best_start, best_count = 0, 0
        # Sliding 30-day window with a Counter.
        from collections import deque
        window = deque()
        i = 0
        per_day = Counter(d for _, d in day_of)
        for start in range(max_day - 30 + 1):
            cnt = sum(per_day[d] for d in range(start, start + 30))
            if cnt > best_count:
                best_count, best_start = cnt, start
        events = [e for e, d in day_of if best_start <= d < best_start + 30]

    # Top ~80 most active actors to keep things musical.
    activity = Counter()
    for e in events:
        activity[e["sender"]] += 1
        activity[e["receiver"]] += 1
    top_actors = {a for a, _ in activity.most_common(80)}
    events = [e for e in events if e["sender"] in top_actors and e["receiver"] in top_actors]

    present = sorted({e["sender"] for e in events} | {e["receiver"] for e in events}, key=int)
    # Assign two coarse groups by activity quartile to give the music some
    # tonal contrast even without real department labels.
    sorted_by_activity = sorted(present, key=lambda a: -activity[a])
    high = set(sorted_by_activity[: len(sorted_by_activity) // 3])
    low = set(sorted_by_activity[-len(sorted_by_activity) // 3:])
    actors = [
        {
            "id": a,
            "name": a,
            "group": "high" if a in high else ("low" if a in low else "mid"),
        }
        for a in present
    ]

    write_dataset("radoslaw", {
        "name": "Manufacturing email (Michalski et al. 2011)",
        "description": "One busy month of internal email at a mid-sized European manufacturing company. "
                       "Used as an Enron-like substitute: small, fully temporal, and openly redistributable. "
                       "Actor groups are by activity quartile (high / mid / low) since the dataset has no department metadata.",
        "credit": "Michalski, Palus & Kazienko, HCI 2011. Network Repository.",
        "license": "Free for academic use with citation.",
    }, actors, events)


if __name__ == "__main__":
    workplace()
    hospital()
    primary_school()
    eu_core()
    radoslaw()
