#!/usr/bin/env python3
"""Synthetic fixture generator for Lumos Fire Calendar.

FIXTURE -- NOT REAL DATA.

Writes a fake but schema-exact ``lumos_bundle/`` (same layout as Notebook A's
output, see CONTRACT.md section 2) so Notebook B can be developed and tested
without network access.

Usage:
    python make_fixture_bundle.py --out /home/claude/lumos/fixtures/out [--seed 20261009]

Result: <out>/lumos_bundle/... ; then ``LUMOS_INPUT=<out>`` for Notebook B.

What is simulated (deterministic for a given seed):
  * Latent fire "events" around fixed cluster centres (~5 km spread) with strong
    seasonality: Bangladesh peak Feb-Apr; Australia NSW peak Oct-Jan with a
    Black-Summer-like spike in 2019-11 .. 2020-01; other AU states own seasons.
  * Per event, each satellite overpass produces Poisson detections:
      Aqua  mu = 0.45 * g^0.5 / scan^0.35             (g = event FRP / 20 MW)
      Terra mu = 0.8 * Aqua-formula (independent scan)
      S-NPP mu = 0.85 * g^0.8 * (1 + 0.12*aqua_scan)  (=> ~3-4x Aqua, nonlinear)
    Aqua absent before 2002-07-04 UTC.
  * United_States (v1.2 addendum): fire clusters inside California (USA-CA polygon: north,
    Sierra, southern Sierra/Tehachapi, SoCal; peak Jul-Oct, with a 2020-like Aug-Oct spike and a
    Nov-2018 spike, all synthetic) plus a few clusters elsewhere in the USA (Pacific Northwest,
    Southeast, Rockies, Plains, Alaska) so the whole-country USA aggregate differs from USA-CA.
    USA data uses its OWN random stream (seed ^ 0x55AA), so the Bangladesh / Australia files are
    byte-identical to the pre-USA fixture.
  * type=2 static sources at fixed "kiln" locations near Dhaka/Chattogram
    (dry season Nov-Apr), a few AU industrial sites and a few US industrial / flare sites
    (one inside California).
  * acq_time sometimes written without leading zeros; a few invalid rows
    (lat 999, impossible date, negative frp) and a few exact duplicate rows.
  * version "6.1"/"2.0", plus a few "6.1NRT"/"2.0NRT" rows late in 2024.
  * VIIRS-SNPP 2016 Australia file deliberately omitted -> manifest status
    "missing" (http_status 404) to exercise missing != zero.
  * The fixture mimics a Notebook-A run on 2025-09-15: 2025 is the incomplete
    current year (rows end 2025-09-10); viirs-snpp_2025_Bangladesh is HEADER-ONLY
    (archive not yet published) -> B must treat it as missing, not as zeros.
  * Terra rows are absent from modis_2008_Australia (simulated Terra outage) ->
    B must null the Terra field only.
  * A tiny synthetic Area-API NRT file (raw/firms_api/...) exercises B's separate
    "recent observed" layer.
  * Natural Earth context files mirror the REAL NE properties / names / iso_3166_2
    (7 Bangladesh divisions with old spellings Chittagong/Barisal and no Mymensingh;
    NSW split into mainland + Lord Howe Island, both AU-NSW; USA admin-0 plus the admin-1
    features California US-CA and the neighbours US-NV / US-OR / US-AZ) using simplified real
    polygons from fixtures/ne_subset/ (see extract_ne_subset.py). Detections are
    still synthetic.
"""
from __future__ import annotations

import argparse
import calendar
import hashlib
import json
import os
import shutil
import sys
from pathlib import Path

import numpy as np
import pandas as pd

# --------------------------------------------------------------------------
# Contract constants (CONTRACT.md section 1)
# --------------------------------------------------------------------------
MODIS_COLUMNS = ["latitude", "longitude", "brightness", "scan", "track", "acq_date",
                 "acq_time", "satellite", "instrument", "confidence", "version",
                 "bright_t31", "frp", "daynight", "type"]
VIIRS_COLUMNS = ["latitude", "longitude", "bright_ti4", "scan", "track", "acq_date",
                 "acq_time", "satellite", "instrument", "confidence", "version",
                 "bright_ti5", "frp", "daynight", "type"]
FIRMS_BASE = "https://firms.modaps.eosdis.nasa.gov"
NE_BASE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson"
COUNTRIES = ["Bangladesh", "Australia", "United_States"]   # FIRMS country names (underscore for spaces)
MODIS_YEARS = list(range(2001, 2026))
VIIRS_YEARS = list(range(2012, 2026))
OMIT = {("viirs-snpp", 2016, "Australia")}          # -> status "missing"
HEADER_ONLY = {("viirs-snpp", 2025, "Bangladesh")}   # -> status ok, 0 rows (incomplete current year)
TERRA_OUTAGE = {(2008, "Australia")}                 # Terra rows absent from that MODIS file
USA_COUNTRY = "United_States"
USA_SEED_XOR = 0x55AA                               # separate rng stream for the USA data
RETRIEVED_UTC = "2025-09-15T00:00:00Z"               # fixed for determinism: fixture = an A run on this date
DATA_END = np.datetime64("2025-09-10T23:59")         # last detection in the current-year (2025) files
NE_SUBSET = Path(__file__).resolve().parent / "ne_subset"
AQUA_START = np.datetime64("2002-07-04T00:00")
FIXTURE_NOTE = "SYNTHETIC FIXTURE - NOT REAL DATA"

# local solar overpass times (hours): (day, night)
OVERPASS_LOCAL = {"Aqua": (13.5, 1.5), "Terra": (10.5, 22.5), "N": (13.5, 1.5)}


# --------------------------------------------------------------------------
# Fire-process specification
# --------------------------------------------------------------------------
def _season(peaks: dict[int, float], floor: float = 0.03) -> np.ndarray:
    w = np.full(12, floor)
    for m, v in peaks.items():
        w[m - 1] = v
    return w


REGIONS = {
    # name: (country, lon_range, lat_range, n_clusters, base_rate, season weights)
    "BGD_hills": ("Bangladesh", (91.7, 92.6), (21.3, 23.6), 45, 1.0,
                  _season({1: 0.3, 2: 1.0, 3: 2.6, 4: 2.2, 5: 0.5, 12: 0.1, 11: 0.05})),
    "BGD_plains": ("Bangladesh", (88.3, 91.3), (22.2, 26.2), 70, 0.35,
                   _season({1: 0.6, 2: 1.4, 3: 2.0, 4: 1.3, 5: 0.3, 11: 0.4, 12: 0.5, 10: 0.2})),
    "BGD_sylhet": ("Bangladesh", (91.3, 92.4), (24.0, 25.1), 15, 0.6,
                   _season({1: 0.5, 2: 1.2, 3: 2.2, 4: 1.0, 12: 0.2})),
    "AUS_NSW": ("Australia", (146.0, 153.0), (-37.0, -28.8), 110, 0.35,
                _season({10: 1.4, 11: 1.9, 12: 2.2, 1: 1.7, 2: 0.7, 3: 0.4, 9: 0.8, 8: 0.4, 4: 0.3,
                         5: 0.2, 6: 0.15, 7: 0.2}, floor=0.1)),
    "AUS_VIC": ("Australia", (142.0, 149.5), (-38.5, -36.0), 25, 0.25,
                _season({12: 1.2, 1: 2.0, 2: 1.8, 3: 1.2, 11: 0.5, 4: 0.6})),
    "AUS_QLD": ("Australia", (142.0, 152.5), (-27.5, -16.0), 40, 0.4,
                _season({8: 1.0, 9: 1.8, 10: 2.0, 11: 1.4, 7: 0.6, 12: 0.5, 6: 0.3})),
    "AUS_NT": ("Australia", (130.0, 137.0), (-16.5, -11.5), 35, 0.6,
               _season({5: 0.8, 6: 1.6, 7: 2.0, 8: 2.2, 9: 1.8, 10: 1.0, 4: 0.3})),
    "AUS_WA": ("Australia", (115.5, 128.5), (-34.5, -15.0), 20, 0.35,
               _season({9: 1.2, 10: 1.6, 11: 1.0, 6: 0.6, 7: 0.8, 8: 1.0, 12: 0.5, 1: 0.4})),
}

# United States (v1.2 addendum). Box -> clusters; USA_CA_* boxes lie inside the real Natural Earth US-CA
# polygon (checked with a 0.12 deg margin when the fixture was designed).
REGIONS_USA = {
    "USA_CA_NORTH": (USA_COUNTRY, (-123.4, -121.0), (40.0, 41.6), 22, 0.55,
                     _season({6: 0.7, 7: 1.8, 8: 2.2, 9: 1.8, 10: 1.0, 5: 0.3, 11: 0.3}, floor=0.04)),
    "USA_CA_SIERRA": (USA_COUNTRY, (-121.2, -120.4), (37.0, 38.8), 20, 0.5,
                      _season({6: 0.8, 7: 1.8, 8: 2.2, 9: 1.9, 10: 1.1, 5: 0.3, 11: 0.3}, floor=0.04)),
    "USA_CA_SSIERRA": (USA_COUNTRY, (-120.2, -119.2), (35.2, 36.5), 18, 0.5,
                       _season({6: 0.9, 7: 1.8, 8: 2.0, 9: 1.8, 10: 1.1, 5: 0.4, 11: 0.4}, floor=0.05)),
    "USA_CA_SOCAL": (USA_COUNTRY, (-117.4, -116.6), (33.5, 34.3), 14, 0.5,
                     _season({7: 0.9, 8: 1.0, 9: 1.2, 10: 1.8, 11: 1.4, 12: 0.8, 5: 0.3, 6: 0.5}, floor=0.1)),
    "USA_PNW": (USA_COUNTRY, (-123.0, -118.0), (43.0, 47.0), 22, 0.55,
                _season({7: 1.4, 8: 2.2, 9: 1.8, 6: 0.5, 10: 0.5}, floor=0.03)),
    "USA_SOUTHEAST": (USA_COUNTRY, (-90.0, -82.0), (30.0, 35.0), 25, 0.75,
                      _season({2: 1.0, 3: 2.0, 4: 1.2, 11: 0.5, 12: 0.4, 1: 0.5}, floor=0.1)),
    "USA_ROCKIES": (USA_COUNTRY, (-114.0, -106.0), (40.0, 47.0), 18, 0.5,
                    _season({7: 1.2, 8: 2.0, 9: 1.4, 6: 0.4}, floor=0.03)),
    "USA_PLAINS": (USA_COUNTRY, (-98.0, -95.0), (37.0, 39.0), 14, 0.8,
                   _season({3: 1.8, 4: 2.2, 10: 0.4, 11: 0.4}, floor=0.05)),
    "USA_ALASKA": (USA_COUNTRY, (-152.0, -145.0), (63.0, 66.0), 10, 0.3,
                   _season({6: 1.5, 7: 2.0, 8: 0.6}, floor=0.0)),
}
# California-like spikes (synthetic): Nov 2018 and Aug-Oct 2020, applied to the four USA_CA_* regions only
CA_SPIKES = {(2018, 11): 3.0, (2020, 8): 4.0, (2020, 9): 6.0, (2020, 10): 4.0}
USA_SPIKE_REGIONS = {"USA_CA_NORTH", "USA_CA_SIERRA", "USA_CA_SSIERRA", "USA_CA_SOCAL"}

RATE_SCALE = 1.7  # global activity scale (tunes total row count)

# Black-Summer-like multipliers (year, month) for south-east Australia
BLACK_SUMMER = {(2019, 9): 2.0, (2019, 10): 3.5, (2019, 11): 7.0, (2019, 12): 14.0,
                (2020, 1): 11.0, (2020, 2): 2.5}
BLACK_SUMMER_REGIONS = {"AUS_NSW", "AUS_VIC"}

# Static (type 2) sources: kilns near Dhaka & Chattogram, AU industrial sites
def _static_sites(rng: np.random.Generator) -> pd.DataFrame:
    rows = []
    for i in range(22):  # Dhaka-region brick-kiln belt
        rows.append(("Bangladesh", 23.60 + 0.40 * rng.random(), 90.15 + 0.45 * rng.random(), "kiln"))
    for i in range(8):   # Chattogram kilns
        rows.append(("Bangladesh", 22.25 + 0.30 * rng.random(), 91.75 + 0.15 * rng.random(), "kiln"))
    for lat, lon in [(-32.90, 151.75), (-34.45, 150.88), (-23.85, 151.25), (-20.73, 139.49)]:
        rows.append(("Australia", lat, lon, "industry"))
    df = pd.DataFrame(rows, columns=["country", "lat", "lon", "kind"])
    df["lat"] = df["lat"].round(4)
    df["lon"] = df["lon"].round(4)
    return df


def _static_sites_usa() -> pd.DataFrame:
    """US industrial / flare-like static sources (type 2); the Martinez one lies inside California."""
    rows = [(USA_COUNTRY, lat, lon, "industry") for lat, lon in
            [(37.99, -122.10), (29.72, -95.01), (31.90, -102.00), (48.10, -103.60), (40.70, -74.15)]]
    return pd.DataFrame(rows, columns=["country", "lat", "lon", "kind"])


# --------------------------------------------------------------------------
# Simulation
# --------------------------------------------------------------------------
def _make_clusters(rng, regions=None):
    regions = REGIONS if regions is None else regions
    recs = []
    for reg, (country, (lo0, lo1), (la0, la1), n, base, _) in regions.items():
        lons = rng.uniform(lo0, lo1, n)
        lats = rng.uniform(la0, la1, n)
        w = rng.lognormal(0.0, 0.8, n)  # heterogeneous cluster activity
        for i in range(n):
            recs.append((reg, country, lats[i], lons[i], RATE_SCALE * base * w[i]))
    return pd.DataFrame(recs, columns=["region", "country", "lat", "lon", "rate"])


def simulate_events(rng, clusters: pd.DataFrame, years: list[int], regions=None,
                    spikes=None) -> pd.DataFrame:
    """Latent fire events (one per fire-day) for all clusters/years/months."""
    regions = REGIONS if regions is None else regions
    spikes = (BLACK_SUMMER, BLACK_SUMMER_REGIONS) if spikes is None else spikes
    yr_eff = {(reg, y): rng.lognormal(0.0, 0.3) for reg in regions for y in years}
    parts = []
    for y in years:
        for m in range(1, 13):
            mult = np.array([
                regions[r][5][m - 1] * yr_eff[(r, y)] *
                (spikes[0].get((y, m), 1.0) if r in spikes[1] else 1.0)
                for r in clusters["region"]])
            lam = clusters["rate"].to_numpy() * mult
            n = rng.poisson(lam)
            if n.sum() == 0:
                continue
            idx = np.repeat(np.arange(len(clusters)), n)
            ndays = calendar.monthrange(y, m)[1]
            ev = pd.DataFrame({
                "cluster": idx,
                "year": y, "month": m,
                "day": rng.integers(1, ndays + 1, idx.size),
                "lat": clusters["lat"].to_numpy()[idx] + rng.normal(0, 0.022, idx.size),
                "lon": clusters["lon"].to_numpy()[idx] + rng.normal(0, 0.022, idx.size),
                "frp_event": rng.lognormal(np.log(18.0), 1.0, idx.size),
                "country": clusters["country"].to_numpy()[idx],
            })
            parts.append(ev)
    return pd.concat(parts, ignore_index=True)


def _utc_times(rng, local_day: np.ndarray, lon: np.ndarray, sat: str, is_day: np.ndarray):
    """local_day: datetime64[D]; returns datetime64[m] UTC."""
    d_h, n_h = OVERPASS_LOCAL[sat]
    local_h = np.where(is_day, d_h, n_h) + rng.normal(0, 0.45, local_day.size)
    utc_min = np.round((local_h - lon / 15.0) * 60).astype("int64")
    return local_day.astype("datetime64[m]") + utc_min.astype("timedelta64[m]")


def detections_for_sat(rng, ev: pd.DataFrame, sat: str, aqua_scan=None) -> pd.DataFrame:
    g = ev["frp_event"].to_numpy() / 20.0
    n_ev = len(ev)
    if sat in ("Aqua", "Terra"):
        scan = 1.0 + 3.8 * rng.random(n_ev) ** 2
        mu = 0.45 * g ** 0.5 / scan ** 0.35
        if sat == "Terra":
            mu = 0.8 * mu
    else:  # S-NPP; depends nonlinearly on frp and on Aqua's view geometry
        scan = 0.32 + 0.48 * rng.random(n_ev) ** 1.5
        mu = 0.85 * g ** 0.8 * (1.0 + 0.12 * aqua_scan)
    k = rng.poisson(mu)
    idx = np.repeat(np.arange(n_ev), k)
    sub = ev.iloc[idx].reset_index(drop=True)
    n = len(sub)
    sc = scan[idx]
    is_day = rng.random(n) < 0.82
    local_day = (pd.to_datetime(dict(year=sub["year"], month=sub["month"], day=sub["day"]))
                 .to_numpy().astype("datetime64[D]"))
    jit = 0.008 if sat != "N" else 0.003
    lat = sub["lat"].to_numpy() + rng.normal(0, jit, n)
    lon = sub["lon"].to_numpy() + rng.normal(0, jit, n)
    utc = _utc_times(rng, local_day, lon, sat, is_day)
    frp_pix = sub["frp_event"].to_numpy() / np.maximum(k[idx], 1) * rng.lognormal(0, 0.5, n)
    out = pd.DataFrame({"country": sub["country"].to_numpy(), "utc": utc, "lat": lat, "lon": lon,
                        "scan": sc, "is_day": is_day, "frp": frp_pix, "type": 0})
    out["satellite"] = sat
    return out, scan


def static_detections(rng, sites: pd.DataFrame, years, sat: str) -> pd.DataFrame:
    parts = []
    for y in years:
        for m in range(1, 13):
            dry = m in (11, 12, 1, 2, 3, 4)
            active = sites["kind"].eq("industry") | (sites["kind"].eq("kiln") & dry)
            s = sites[active]
            rate = 1.0 if sat != "N" else 2.5
            if sat == "Terra":
                rate = 0.8
            k = rng.poisson(rate, len(s))
            idx = np.repeat(np.arange(len(s)), k)
            n = idx.size
            if n == 0:
                continue
            ndays = calendar.monthrange(y, m)[1]
            day = np.array([np.datetime64(f"{y}-{m:02d}-01")] * n) + rng.integers(0, ndays, n).astype("timedelta64[D]")
            lon = s["lon"].to_numpy()[idx] + rng.normal(0, 0.0007, n)
            is_day = rng.random(n) < 0.6
            parts.append(pd.DataFrame({
                "country": s["country"].to_numpy()[idx],
                "utc": _utc_times(rng, day, lon, sat, is_day),
                "lat": s["lat"].to_numpy()[idx] + rng.normal(0, 0.0007, n),
                "lon": lon,
                "scan": (1.0 + 3.8 * rng.random(n) ** 2) if sat != "N" else 0.32 + 0.48 * rng.random(n),
                "is_day": is_day,
                "frp": rng.lognormal(np.log(12.0), 0.6, n),
                "type": 2, "satellite": sat}))
    return pd.concat(parts, ignore_index=True)


def _fmt_time(rng, utc: np.ndarray) -> np.ndarray:
    hhmm = (pd.DatetimeIndex(utc).hour * 100 + pd.DatetimeIndex(utc).minute).to_numpy()
    padded = np.char.zfill(hhmm.astype(str), 4)
    raw = hhmm.astype(str)
    return np.where(rng.random(hhmm.size) < 0.15, raw, padded).astype(object)


def to_modis_rows(rng, d: pd.DataFrame) -> pd.DataFrame:
    n = len(d)
    day = d["is_day"].to_numpy()
    lf = np.log1p(d["frp"].to_numpy())
    out = pd.DataFrame({
        "latitude": d["lat"].round(4).to_numpy(),
        "longitude": d["lon"].round(4).to_numpy(),
        "brightness": np.clip(np.where(day, 305, 296) + 9.0 * lf + rng.normal(0, 4, n), 300, 505).round(1),
        "scan": d["scan"].round(1).to_numpy(),
        "track": (1.0 + (d["scan"].to_numpy() - 1.0) * 0.26).round(1),
        "acq_date": pd.DatetimeIndex(d["utc"].to_numpy()).strftime("%Y-%m-%d").to_numpy(),
        "acq_time": _fmt_time(rng, d["utc"].to_numpy()),
        "satellite": d["satellite"].to_numpy(),
        "instrument": "MODIS",
        "confidence": np.clip(np.round(45 + 9 * lf + rng.normal(0, 14, n)), 0, 100).astype(int),
        "version": "6.1",
        "bright_t31": (np.where(day, 296, 287) + rng.normal(0, 5, n)).round(1),
        "frp": d["frp"].round(1).to_numpy(),
        "daynight": np.where(day, "D", "N"),
        "type": d["type"].astype(int).to_numpy(),
    })
    return out[MODIS_COLUMNS]


def to_viirs_rows(rng, d: pd.DataFrame) -> pd.DataFrame:
    n = len(d)
    day = d["is_day"].to_numpy()
    lf = np.log1p(d["frp"].to_numpy())
    u = rng.random(n) + 0.12 * lf
    conf = np.where(u < 0.18, "l", np.where(u < 0.92, "n", "h"))
    out = pd.DataFrame({
        "latitude": d["lat"].round(5).to_numpy(),
        "longitude": d["lon"].round(5).to_numpy(),
        "bright_ti4": np.clip(np.where(day, 318, 298) + 12.0 * lf + rng.normal(0, 6, n), 295, 367).round(2),
        "scan": d["scan"].round(2).to_numpy(),
        "track": np.clip(0.36 + (d["scan"].to_numpy() - 0.32) * 0.88, 0.36, 0.78).round(2),
        "acq_date": pd.DatetimeIndex(d["utc"].to_numpy()).strftime("%Y-%m-%d").to_numpy(),
        "acq_time": _fmt_time(rng, d["utc"].to_numpy()),
        "satellite": "N",
        "instrument": "VIIRS",
        "confidence": conf,
        "version": "2.0",
        "bright_ti5": (np.where(day, 299, 285) + rng.normal(0, 5, n)).round(2),
        "frp": d["frp"].round(2).to_numpy(),
        "daynight": np.where(day, "D", "N"),
        "type": d["type"].astype(int).to_numpy(),
    })
    return out[VIIRS_COLUMNS]


def corrupt(rng, df: pd.DataFrame, year: int, nrt_version: str) -> pd.DataFrame:
    """Add a few invalid rows, exact duplicates, NRT version labels."""
    df = df.copy()
    df["acq_time"] = df["acq_time"].astype(object)
    if len(df) == 0:
        return df
    # NRT rows: ~1% of Nov-Dec 2024 rows
    if year == 2024:
        late = df["acq_date"].str.slice(5, 7).isin(["11", "12"]).to_numpy()
        pick = late & (rng.random(len(df)) < 0.05)
        df.loc[pick, "version"] = nrt_version
    extra = []
    r = rng.random()
    if r < 0.5:  # invalid rows
        bad = df.sample(n=min(3, len(df)), random_state=int(rng.integers(1 << 31))).copy()
        kinds = ["lat", "date", "frp"]
        for j, (ix, _) in enumerate(bad.iterrows()):
            k = kinds[j % 3]
            if k == "lat":
                bad.loc[ix, "latitude"] = 999.0
            elif k == "date":
                bad.loc[ix, "acq_date"] = f"{year}-02-30" if j % 2 else "not-a-date"
            else:
                bad.loc[ix, "frp"] = -5.0
        extra.append(bad)
    if rng.random() < 0.6:  # exact duplicates
        extra.append(df.sample(n=min(int(rng.integers(1, 4)), len(df)),
                               random_state=int(rng.integers(1 << 31))))
    if extra:
        df = pd.concat([df] + extra, ignore_index=True)
    return df


# --------------------------------------------------------------------------
# Natural Earth stand-ins
# --------------------------------------------------------------------------
def _rect(lon0, lat0, lon1, lat1):
    return {"type": "Polygon",
            "coordinates": [[[lon0, lat0], [lon1, lat0], [lon1, lat1], [lon0, lat1], [lon0, lat0]]]}


# Fallback only (used if fixtures/ne_subset/ is absent): rectangles carrying the REAL Natural Earth
# 10m admin-1 names / iso_3166_2 codes (NE has 7 BGD divisions, old spellings, no Mymensingh).
BGD_DIVISIONS = [  # name, iso_3166_2, lon0, lat0, lon1, lat1
    ("Rangpur", "BD-F", 88.0, 25.15, 89.85, 26.65),
    ("Rajshahi", "BD-E", 88.0, 23.8, 89.3, 25.15),
    ("Khulna", "BD-D", 88.5, 21.6, 89.9, 23.8),
    ("Dhaka", "BD-C", 89.3, 23.0, 91.0, 25.4),
    ("Barisal", "BD-A", 89.9, 21.8, 91.0, 23.0),
    ("Sylhet", "BD-G", 91.0, 24.0, 92.5, 25.2),
    ("Chittagong", "BD-B", 91.0, 20.7, 92.7, 24.0),
]
AUS_STATES = [
    ("New South Wales", "AU-NSW", "State", 141.0, -37.5, 153.6, -28.2),
    ("Lord Howe Island", "AU-NSW", "Territory", 159.04, -31.59, 159.11, -31.52),
    ("Australian Capital Territory", "AU-ACT", "Territory", 148.77, -35.92, 149.4, -35.14),
    ("Jervis Bay Territory", "AU-X02~", "Territory", 150.61, -35.2, 150.77, -35.12),
    ("Victoria", "AU-VIC", "State", 141.0, -39.2, 150.0, -37.5),
    ("Queensland", "AU-QLD", "State", 138.0, -28.2, 153.6, -10.7),
    ("South Australia", "AU-SA", "State", 129.0, -38.1, 141.0, -26.0),
    ("Northern Territory", "AU-NT", "Territory", 129.0, -26.0, 138.0, -10.9),
    ("Western Australia", "AU-WA", "State", 112.9, -35.2, 129.0, -13.7),
    ("Tasmania", "AU-TAS", "State", 144.6, -43.7, 148.5, -40.6),
]
USA_STATES = [  # rectangles only used in the fallback; California box covers the fixture CA clusters
    ("California", "US-CA", -124.4, 32.5, -114.1, 42.0),
    ("Nevada", "US-NV", -120.0, 35.0, -114.0, 42.0),
    ("Oregon", "US-OR", -124.6, 42.0, -116.5, 46.3),
    ("Arizona", "US-AZ", -114.8, 31.3, -109.0, 37.0),
]


def natural_earth_fixtures():
    """Admin-0/1 FeatureCollections mirroring REAL Natural Earth (properties verbatim, simplified polygons)."""
    a0p = NE_SUBSET / "ne_110m_admin_0_BGD_AUS_USA.geojson"
    a1p = NE_SUBSET / "ne_10m_admin_1_BGD_AUS_USA_simplified.geojson"
    note = (FIXTURE_NOTE + "; boundaries = real Natural Earth BGD/AUS/USA features (admin-1 simplified "
            "0.005 deg; USA admin-1 limited to US-CA plus neighbours US-NV/US-OR/US-AZ)")
    if a0p.exists() and a1p.exists():
        admin0 = json.loads(a0p.read_text(encoding="utf-8"))
        admin1 = json.loads(a1p.read_text(encoding="utf-8"))
        for d in (admin0, admin1):
            d["synthetic"] = True
            d["note"] = note
        return admin0, admin1
    print("[fixture] WARNING: fixtures/ne_subset missing -> rectangle stand-ins with real NE names/codes")
    admin0 = {"type": "FeatureCollection", "synthetic": True, "note": FIXTURE_NOTE, "features": []}
    for name, a3, a2, bbox in [("Bangladesh", "BGD", "BD", (88.08, 20.67, 92.67, 26.45)),
                               ("Australia", "AUS", "AU", (113.3, -43.6, 153.6, -10.7)),
                               ("United States of America", "USA", "US", (-125.0, 24.5, -66.9, 49.4))]:
        admin0["features"].append({"type": "Feature", "properties": {
            "featurecla": "Admin-0 country", "ADMIN": name, "NAME": name, "NAME_LONG": name,
            "SOVEREIGNT": name, "ADM0_A3": a3, "ISO_A3": a3, "ISO_A2": a2},
            "geometry": _rect(*bbox)})
    admin1 = {"type": "FeatureCollection", "synthetic": True, "note": FIXTURE_NOTE, "features": []}
    for name, iso, lo0, la0, lo1, la1 in BGD_DIVISIONS:
        admin1["features"].append({"type": "Feature", "properties": {
            "featurecla": "Admin-1 states provinces", "name": name, "admin": "Bangladesh", "adm0_a3": "BGD",
            "iso_a2": "BD", "iso_3166_2": iso, "type_en": "Division", "region": None},
            "geometry": _rect(lo0, la0, lo1, la1)})
    for name, iso, typ, lo0, la0, lo1, la1 in AUS_STATES:
        admin1["features"].append({"type": "Feature", "properties": {
            "featurecla": "Admin-1 states provinces", "name": name, "admin": "Australia", "adm0_a3": "AUS",
            "iso_a2": "AU", "iso_3166_2": iso, "type_en": typ, "region": None},
            "geometry": _rect(lo0, la0, lo1, la1)})
    for name, iso, lo0, la0, lo1, la1 in USA_STATES:
        admin1["features"].append({"type": "Feature", "properties": {
            "featurecla": "Admin-1 states provinces", "name": name, "admin": "United States of America",
            "adm0_a3": "USA", "iso_a2": "US", "iso_3166_2": iso, "type_en": "State", "region": "West"},
            "geometry": _rect(lo0, la0, lo1, la1)})
    return admin0, admin1


# --------------------------------------------------------------------------
# Writing
# --------------------------------------------------------------------------
def sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def count_rows(p: Path) -> int:
    with open(p, "rb") as f:
        return max(sum(1 for _ in f) - 1, 0)


def self_check_headers(bundle: Path) -> None:
    """Tiny real-header self-check: every CSV header must equal the contract."""
    n = 0
    for p in sorted((bundle / "raw" / "firms_country").rglob("*.csv")):
        header = p.open(encoding="utf-8").readline().strip().split(",")
        expected = MODIS_COLUMNS if p.name.startswith("modis_") else VIIRS_COLUMNS
        assert header == expected, f"header mismatch in {p}: {header}"
        n += 1
    assert n > 0
    print(f"[self-check] {n} CSV headers match CONTRACT.md column lists exactly")


def build(out_dir: Path, seed: int = 20261009) -> Path:
    rng = np.random.default_rng(seed)
    bundle = out_dir / "lumos_bundle"
    if bundle.exists():
        shutil.rmtree(bundle)
    for sub in ["raw/firms_country", "context", "wheelhouse", "manifests"]:
        (bundle / sub).mkdir(parents=True, exist_ok=True)

    # United_States has its own random stream so BGD/AUS stay byte-identical to the pre-USA fixture
    rng_us = np.random.default_rng(seed ^ USA_SEED_XOR)

    def simulate(rng_, regions, make_sites, spikes=None):
        cl = _make_clusters(rng_, regions)
        sites_ = make_sites()   # after the clusters: keeps the BGD/AUS random stream order unchanged
        ev_ = simulate_events(rng_, cl, years, regions, spikes)
        aqua_, aqua_scan_ = detections_for_sat(rng_, ev_, "Aqua")
        terra_, _ = detections_for_sat(rng_, ev_, "Terra")
        snpp_, _ = detections_for_sat(rng_, ev_, "N", aqua_scan=aqua_scan_)
        st_ = {s: static_detections(rng_, sites_, years, s) for s in ("Aqua", "Terra", "N")}
        return aqua_, terra_, snpp_, st_

    years = list(range(2000, 2026))  # simulate a margin; files written only for contract years
    aqua, terra, snpp, st = simulate(rng, REGIONS, lambda: _static_sites(rng))
    u_aqua, u_terra, u_snpp, u_st = simulate(rng_us, REGIONS_USA, _static_sites_usa,
                                              (CA_SPIKES, USA_SPIKE_REGIONS))
    modis = pd.concat([aqua, terra, st["Aqua"], st["Terra"], u_aqua, u_terra, u_st["Aqua"], u_st["Terra"]],
                      ignore_index=True)
    modis = modis[(modis["satellite"] != "Aqua") | (modis["utc"] >= AQUA_START)]
    viirs = pd.concat([snpp, st["N"], u_snpp, u_st["N"]], ignore_index=True)
    viirs = viirs[viirs["utc"] >= np.datetime64("2012-01-20T00:00")]  # S-NPP VIIRS start
    modis = modis[modis["utc"] <= DATA_END]   # A ran on 2025-09-15: current year incomplete
    viirs = viirs[viirs["utc"] <= DATA_END]

    sources = []
    total = 0
    for sensor, det, yrs, conv, nrt in [("modis", modis, MODIS_YEARS, to_modis_rows, "6.1NRT"),
                                        ("viirs-snpp", viirs, VIIRS_YEARS, to_viirs_rows, "2.0NRT")]:
        det = det.assign(uyear=pd.DatetimeIndex(det["utc"].to_numpy()).year)
        for country in COUNTRIES:
            dc = det[det["country"] == country]
            for y in yrs:
                fname = f"{sensor}_{y}_{country}.csv"
                rel = f"raw/firms_country/{sensor}/{y}/{fname}"
                url = f"{FIRMS_BASE}/data/country/{sensor}/{y}/{fname}"
                rec = {"id": f"{sensor}_{y}_{country}", "kind": "firms_country", "url": url,
                       "local_path": None, "sensor": sensor, "country": country, "year": y,
                       "http_status": 404, "bytes": None, "sha256": None, "rows": None,
                       "retrieved_utc": RETRIEVED_UTC, "status": "missing",
                       "note": FIXTURE_NOTE + "; deliberately omitted (404)", "synthetic": True}
                if (sensor, y, country) not in OMIT:
                    d = dc[dc["uyear"] == y].sort_values("utc", kind="stable")
                    if sensor == "modis" and (y, country) in TERRA_OUTAGE:
                        d = d[d["satellite"] != "Terra"]
                    rng_c = rng_us if country == USA_COUNTRY else rng
                    rows = corrupt(rng_c, conv(rng_c, d), y, nrt)
                    if (sensor, y, country) in HEADER_ONLY:
                        rows = rows.iloc[0:0]
                    p = bundle / rel
                    p.parent.mkdir(parents=True, exist_ok=True)
                    rows.to_csv(p, index=False, lineterminator="\n")
                    nrows = count_rows(p)
                    total += nrows
                    note = FIXTURE_NOTE
                    if (sensor, y, country) in HEADER_ONLY:
                        note += "; header-only file (0 rows): incomplete current year"
                    if sensor == "modis" and (y, country) in TERRA_OUTAGE:
                        note += "; simulated Terra outage (no Terra rows)"
                    rec.update(local_path=rel, http_status=200, bytes=p.stat().st_size,
                               sha256=sha256_file(p), rows=nrows, status="ok", note=note)
                sources.append(rec)

    # tiny synthetic Area-API NRT file (VIIRS columns minus `type`), last 5 days before retrieval
    d0 = np.datetime64("2025-09-06T00:00")
    for country in COUNTRIES:
        d = viirs[(viirs["country"] == country) & (viirs["utc"] >= d0) & (viirs["type"] == 0)]
        rows = to_viirs_rows(rng_us if country == USA_COUNTRY else rng, d).drop(columns=["type"])
        rows["version"] = "2.0NRT"
        rel = f"raw/firms_api/VIIRS_SNPP_NRT/{country}/VIIRS_SNPP_NRT_{country}_2025-09-06_5d.csv"
        p = bundle / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        rows.to_csv(p, index=False, lineterminator="\n")
        sources.append({"id": f"api_VIIRS_SNPP_NRT_{country}_2025-09-06_5d", "kind": "firms_api",
                        "url": f"{FIRMS_BASE}/api/area/csv/{{MAP_KEY}}/VIIRS_SNPP_NRT/x/5/2025-09-06",
                        "local_path": rel, "sensor": "VIIRS_SNPP_NRT", "country": country, "year": 2025,
                        "http_status": 200, "bytes": p.stat().st_size, "sha256": sha256_file(p),
                        "rows": count_rows(p), "retrieved_utc": RETRIEVED_UTC, "status": "ok",
                        "note": FIXTURE_NOTE + "; synthetic NRT", "synthetic": True})

    admin0, admin1 = natural_earth_fixtures()
    for fname, obj in [("ne_110m_admin_0_countries.geojson", admin0),
                       ("ne_10m_admin_1_states_provinces.geojson", admin1)]:
        p = bundle / "context" / fname
        p.write_text(json.dumps(obj, indent=1), encoding="utf-8")
        sources.append({"id": f"context_{fname.split('.')[0]}", "kind": "context", "url": f"{NE_BASE}/{fname}",
                        "local_path": f"context/{fname}", "sensor": "natural_earth", "country": None,
                        "year": None, "http_status": 200, "bytes": p.stat().st_size, "sha256": sha256_file(p),
                        "rows": len(obj["features"]), "retrieved_utc": RETRIEVED_UTC, "status": "ok",
                        "note": FIXTURE_NOTE, "synthetic": True})

    (bundle / "wheelhouse" / "FIXTURE_EMPTY_WHEELHOUSE.txt").write_text(
        "FIXTURE - NOT REAL DATA. No wheels in the synthetic bundle.\n")
    man = bundle / "manifests"
    (man / "sources.json").write_text(json.dumps(sources, indent=1), encoding="utf-8")
    (man / "env_A.json").write_text(json.dumps({
        "synthetic": True, "note": FIXTURE_NOTE, "generator": "fixtures/make_fixture_bundle.py",
        "seed": seed, "python_version": "fixture", "platform": "fixture", "packages": {},
        "wheelhouse": {"requested": [], "succeeded": [], "failed": [], "files": []},
        "created_utc": RETRIEVED_UTC}, indent=1))
    (man / "config_A.json").write_text(json.dumps({
        "synthetic": True, "note": FIXTURE_NOTE, "COUNTRIES": COUNTRIES, "EXTRA_COUNTRIES": [],
        "MODIS_YEARS": MODIS_YEARS, "VIIRS_YEARS": VIIRS_YEARS, "TRY_NOAA20": False,
        "FETCH_API_NRT": True, "header_only_files": [list(o) for o in sorted(HEADER_ONLY)],
        "terra_outage": [list(o) for o in sorted(TERRA_OUTAGE)], "omitted_files": [list(o) for o in sorted(OMIT)], "seed": seed,
        "contract_version": "1.0"}, indent=1))
    (bundle / "README_bundle.md").write_text(
        "# FIXTURE — NOT REAL DATA\n\n"
        "This `lumos_bundle/` was generated by `fixtures/make_fixture_bundle.py` "
        f"(seed {seed}). It mimics the layout and CSV schemas of Notebook A's output "
        "(CONTRACT.md v1.0) but every value is simulated. Use it only for testing "
        "Notebook B; any app export built from it must be `release_stage: ui_prototype` "
        "with `value_status: demo`.\n\n"
        "Deliberate quirks: unpadded acq_time; invalid rows (lat 999, impossible dates, "
        "negative frp); exact duplicate rows; type=2 kiln clusters in Bangladesh; "
        "a few *NRT version rows in late 2024; VIIRS-SNPP 2016 Australia missing (404); "
        "Aqua absent before 2002-07-04; Black-Summer-like spike in NSW/VIC 2019-11..2020-01; "
        "2025 is an incomplete current year (rows end 2025-09-10; viirs-snpp 2025 Bangladesh "
        "header-only); Terra absent from modis_2008_Australia; one synthetic NRT Area-API file per country; "
        "United_States (v1.2 addendum) has California-like activity inside the US-CA polygon plus a few "
        "clusters elsewhere (whole-country USA aggregate differs from USA-CA); "
        "Natural Earth boundaries are simplified REAL NE features (properties verbatim; USA admin-1 limited to "
        "US-CA, US-NV, US-OR, US-AZ).\n", encoding="utf-8")
    (bundle / "FIXTURE_NOT_REAL_DATA.txt").write_text(FIXTURE_NOTE + "\n")
    self_check_headers(bundle)
    print(f"[fixture] wrote {bundle}  total CSV data rows={total:,}  files="
          f"{sum(1 for s in sources if s['status'] == 'ok')}  missing={sum(1 for s in sources if s['status'] == 'missing')}")
    return bundle


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--out", default=str(Path(__file__).resolve().parent / "out"))
    ap.add_argument("--seed", type=int, default=20261009)
    a = ap.parse_args(argv)
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    ready = out / "READY"
    if ready.exists():
        ready.unlink()
    build(out, a.seed)
    ready.write_text("fixture bundle complete\n")


if __name__ == "__main__":
    main()
