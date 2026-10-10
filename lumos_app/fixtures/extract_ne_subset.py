#!/usr/bin/env python3
"""One-off helper: cut the Bangladesh + Australia + United States features out of the REAL Natural Earth files
and store simplified copies in fixtures/ne_subset/ so the (offline) fixture generator can mirror real NE
properties, names, iso_3166_2 codes and approximate shapes.

USA admin-1 is reduced to California (US-CA, the app's detailed USA region) plus three neighbouring states
(US-NV, US-OR, US-AZ) so the fixture can check that only US-CA is picked as the USA admin-1 AOI.

Usage: python extract_ne_subset.py <ne_10m_admin_1_states_provinces.geojson> <ne_110m_admin_0_countries.geojson>
(download from https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/).
Geometries are simplified (admin-1: 0.005 deg, USA neighbours 0.02 deg, admin-0: unchanged 110m); ALL properties
are kept verbatim.
"""
import json
import sys
from pathlib import Path

from shapely.geometry import mapping, shape

HERE = Path(__file__).resolve().parent
OUT = HERE / "ne_subset"
KEEP = {"BGD", "AUS", "USA"}
USA_ADMIN1_KEEP = {"US-CA": 0.005, "US-NV": 0.02, "US-OR": 0.02, "US-AZ": 0.02}   # iso_3166_2 -> simplify tolerance


def main(adm1_path, adm0_path):
    OUT.mkdir(exist_ok=True)
    a1 = json.load(open(adm1_path, encoding="utf-8"))
    feats = []
    for f in a1["features"]:
        p = f["properties"]
        tol = 0.005
        if p.get("adm0_a3") == "USA":
            if p.get("iso_3166_2") not in USA_ADMIN1_KEEP:
                continue
            tol = USA_ADMIN1_KEEP[p["iso_3166_2"]]
        elif p.get("adm0_a3") not in KEEP:
            continue
        g = shape(f["geometry"]).simplify(tol, preserve_topology=True)
        feats.append({"type": "Feature", "properties": f["properties"], "geometry": mapping(g)})
    (OUT / "ne_10m_admin_1_BGD_AUS_USA_simplified.geojson").write_text(
        json.dumps({"type": "FeatureCollection", "features": feats}), encoding="utf-8")
    a0 = json.load(open(adm0_path, encoding="utf-8"))
    feats0 = [f for f in a0["features"] if f["properties"].get("ADM0_A3") in KEEP]
    (OUT / "ne_110m_admin_0_BGD_AUS_USA.geojson").write_text(
        json.dumps({"type": "FeatureCollection", "features": feats0}), encoding="utf-8")
    print(f"admin1 {len(feats)} features, admin0 {len(feats0)} features -> {OUT}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
