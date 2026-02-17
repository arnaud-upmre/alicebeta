#!/usr/bin/env python3
"""Convertit pk.json en pk.geojson.

Formats d'entree acceptes:
- liste de points [{"longitude":..,"latitude":..,"pk":..}, ...]
- FeatureCollection GeoJSON
"""

from __future__ import annotations

import json
from pathlib import Path

INPUT_PATH = Path("pk.json")
OUTPUT_PATH = Path("pk.geojson")



def to_float(value, default=None):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def build_feature(raw, idx):
    if isinstance(raw, dict) and raw.get("type") == "Feature":
        geometry = raw.get("geometry") or {}
        coords = geometry.get("coordinates") or [None, None]
        lon = to_float(coords[0])
        lat = to_float(coords[1])
        props = dict(raw.get("properties") or {})
    else:
        lon = to_float(raw.get("longitude", raw.get("lon", raw.get("x"))))
        lat = to_float(raw.get("latitude", raw.get("lat", raw.get("y"))))
        props = {
            "code_ligne": raw.get("code_ligne"),
            "pk": raw.get("pk"),
            "altitude": raw.get("altitude"),
        }

    if lon is None or lat is None:
        return None

    pk = props.get("pk")
    if "pk_label" not in props and pk is not None:
        props["pk_label"] = f"PK {pk}"

    return {
        "type": "Feature",
        "id": idx,
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": props,
    }


def main():
    raw = json.loads(INPUT_PATH.read_text(encoding="utf-8"))

    if isinstance(raw, dict) and raw.get("type") == "FeatureCollection":
        rows = raw.get("features") or []
    elif isinstance(raw, list):
        rows = raw
    else:
        raise ValueError("Format pk.json non supporte")

    features = []
    for i, row in enumerate(rows):
        feature = build_feature(row, i)
        if feature is not None:
            features.append(feature)

    geojson = {"type": "FeatureCollection", "features": features}
    OUTPUT_PATH.write_text(json.dumps(geojson, ensure_ascii=False), encoding="utf-8")
    print(f"OK: {len(features)} points ecrits dans {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
