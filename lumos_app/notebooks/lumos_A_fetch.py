# ---
# jupyter:
#   jupytext:
#     formats: ipynb,py:percent
#   kernelspec:
#     display_name: Python 3
#     language: python
#     name: python3
# ---

# %% [markdown]
# # Lumos Fire Calendar — Notebook A: fetch the data bundle (Phase 1)
#
# **NASA Space Apps 2026 · Team Lumos (Dhaka)** · contract v1.0
#
# ## Purpose
# This notebook downloads everything Notebook B needs and saves it in `/kaggle/working/lumos_bundle/`. It runs on Kaggle with **Internet ON** (CPU or T4). It fetches:
#
# 1. **NASA FIRMS yearly country files** (no key needed): MODIS C6.1 (Terra + Aqua, 2001–2025) and VIIRS 375 m S-NPP (2012–2025) for Bangladesh and Australia (plus any extra countries you list). A year that FIRMS does not have is logged as `missing`. It is never invented or filled with zeros.
# 2. **Natural Earth boundaries** (public domain): world countries and states/provinces (Bangladesh divisions, New South Wales).
# 3. **A small wheelhouse** of Python packages (PennyLane, ONNX, ...) so Notebook B can install them with the internet off.
# 4. **Manifests**: `sources.json` (every file: URL, size, SHA-256, row count, status), the environment and settings used, and a readable `README_bundle.md`.
#
# Optional: with a FIRMS MAP_KEY secret and `FETCH_API_NRT = True`, it also fetches the last few days of near-real-time detections from the FIRMS Area API.
#
# **Why two notebooks?** On Kaggle the RTX PRO 6000 Blackwell GPU is only available with Internet OFF; with Internet ON you only get CPU or T4. So Notebook A does all downloading, and Notebook B trains on the Blackwell GPU with Internet OFF, reading only the files saved here. Notebook B makes zero network calls.
#
# Each code cell below has a guide cell above it with the same numbering as the runbook: **Phase 1 → Section 1.x → Step 1.x.y**.
#
# ## Phase map
#
# | Section | Cell | What it does | Est. time |
# |---|---|---|---|
# | 1.1 Create and configure the Kaggle notebook | manual | Manual: new notebook, import, Internet ON, CPU or T4, optional secret | 5 min |
# | 1.2 Config | 1 | Countries, years, downloader limits, output folder | < 1 s |
# | 1.3 Helpers | 2 | Imports, expected headers, logger with key redaction | < 5 s |
# | 1.4 Polite downloader | 3 | Download engine: retries, back-off budget, circuit breaker, stall guard, cache | < 1 s |
# | 1.5 Plan the downloads | 4 | Job lists and manifest read/write | < 1 s |
# | 1.6 Download FIRMS country archives | 5 | Download 78 FIRMS yearly CSVs (default config) | 5–25 min |
# | 1.7 Optional recent NRT data | 6 | Optional last 10 days of NRT detections (needs MAP_KEY) | < 1 s / ~1 min |
# | 1.8 Boundaries | 7 | Natural Earth countries and admin-1 boundaries | < 2 min |
# | 1.9 Offline wheelhouse | 8 | Download wheels for offline install in Notebook B | 1–5 min |
# | 1.10 Manifests and README | 9 | Write sources.json, env_A.json, config_A.json, README_bundle.md | < 10 s |
# | 1.11 Summary table | 10 | Table of every file's status and row count | < 5 s |
# | 1.12 Final check and Save Version | 11 | Folder sizes, key leak check, then Save Version | < 1 min + commit run |
#
# Times are estimates. Notebook A has been tested only against a local mirror, not yet against real FIRMS.
#
# ## Phase 1 · Section 1.1 — Create and configure the Kaggle notebook
# **What this step does:** Manual set-up in the Kaggle web UI before any cell runs. Nothing is executed.
#
# **Steps**
#
# - [ ] 1.1.1 On kaggle.com click **Create → New Notebook**.
# - [ ] 1.1.2 In the editor, **File → Import Notebook** and upload `notebooks/lumos_A_fetch.ipynb`. Rename the notebook `lumos_A_fetch` (Notebook B's instructions use this name).
# - [ ] 1.1.3 Right-hand panel **Settings → Internet: ON** (Kaggle only allows this on a phone-verified account).
# - [ ] 1.1.4 **Settings → Accelerator: None** (CPU) or **GPU T4**. No GPU is needed here.
# - [ ] 1.1.5 Leave **Settings → Environment** on the default (latest) image. Notebook B must use the same image, or the offline wheels may not install.
# - [ ] 1.1.6 *(Optional, only for recent near-real-time data)* **Add-ons → Secrets → Add a new secret** named `FIRMS_MAP_KEY` with your free FIRMS MAP_KEY, and tick it for this notebook. Then set `FETCH_API_NRT = True` in 1.2.
# - [ ] 1.1.7 Start the session (the power button, or run the first cell) and follow 1.2 to 1.12 cell by cell, or use **Run All**.
#
# **Check before moving on**
#
# - [ ] The Settings panel shows Internet ON and the accelerator you chose.
# - [ ] The notebook shows 24 cells: this intro, a guide cell above each of the 11 code cells, and the Next phase cell at the end.
#
# **If it fails:** If the Internet toggle is greyed out, verify your phone number in Kaggle account settings. If Import Notebook fails, create the notebook with **File → Upload Notebook** instead.
#
# **Time:** estimate: 5 min
#
# ## Important warnings
#
# - **Same environment for A and B.** A and B must run on the same Kaggle Docker image and Python version, otherwise the wheels may not install offline. Keep both notebooks on the default (latest) environment.
# - **Real data only.** This notebook downloads real NASA data. The synthetic fixture in the repository is only for tests; Notebook B detects it and labels every number as demo.
# - **Keys are never printed or saved.** The MAP_KEY is read from the Kaggle secret, redacted from every log line and manifest (URLs show `{MAP_KEY}`), and the final check scans every file in the bundle and deletes any file that contains it.
# - **Missing is not zero.** Header-only CSVs (for example a current year FIRMS has not filled yet) are kept as `ok` with `rows: 0` and a note; Notebook B treats them as unavailable, never as zeros.
#
# **Robustness:** bounded retries that respect Retry-After; a global back-off budget (`BACKOFF_BUDGET_S`) and a per-host circuit breaker stop endless 429/5xx waits; a per-file stall guard (`FILE_DEADLINE_S`) aborts streams that trickle forever; a disk-full or OS error on one file is recorded in the manifest and the run continues; `sources.json` is rewritten every `MANIFEST_EVERY_N` files.
#
# **Running outside Kaggle:** set `LUMOS_WORK=<dir>` (output goes to `<dir>/lumos_bundle`). Test overrides: `LUMOS_FIRMS_BASE`, `LUMOS_NE_BASE` (point at a local HTTP mirror), `LUMOS_SKIP_WHEELS=1`, `LUMOS_DRY_RUN=1`.
#
# ## Done when
#
# - [ ] Every cell 1–11 ran without an exception.
# - [ ] The summary table (1.11) has no `error` cells.
# - [ ] `key leak check: passed` (1.12).
# - [ ] **Save Version → Save & Run All (Commit)** finished successfully.
# - [ ] The committed version's **Output** tab shows `lumos_bundle/manifests/sources.json`.
#
# *Data acknowledgement:* We acknowledge the use of data from NASA's Fire Information for Resource Management System (FIRMS) (https://earthdata.nasa.gov/firms), part of NASA's Earth Science Data and Information System (ESDIS). Boundaries: Natural Earth (public domain).

# %% [markdown]
# ## Phase 1 · Section 1.2 — Config
# **What this cell does:** Sets the countries, year ranges, politeness limits for the downloader and the output folder (`/kaggle/working/lumos_bundle`). It only defines settings and prints nothing.
#
# **Steps**
#
# - [ ] 1.2.1 Check `COUNTRIES` (default Bangladesh and Australia). Leave `EXTRA_COUNTRIES = []` unless you were asked to add training countries; each extra country adds download time.
# - [ ] 1.2.2 Leave `MODIS_YEARS` (2001–2025) and `VIIRS_YEARS` (2012–2025) as they are.
# - [ ] 1.2.3 Set `FETCH_API_NRT = True` only if you added the `FIRMS_MAP_KEY` secret in 1.1.6. Otherwise leave it `False`.
# - [ ] 1.2.4 Leave `TRY_NOAA20 = False` (that FIRMS folder is unverified; it would only log 404s).
# - [ ] 1.2.5 Leave the politeness settings (`MAX_WORKERS = 4`, `MAX_RETRIES = 3`, `BACKOFF_BUDGET_S`, `CIRCUIT_BREAKER_N`, `FILE_DEADLINE_S`) unless FIRMS is rate-limiting you heavily.
# - [ ] 1.2.6 Run the cell. Do not set any `LUMOS_*` environment variables on Kaggle; they are for local tests only.
#
# **Check before moving on**
#
# - [ ] The cell finishes with no output and no error.
#
# **If it fails:** A `SyntaxError` means an edit broke a list or a quote. Compare your edit with the defaults above it and run the cell again.
#
# **Time:** estimate: under 1 s

# %%
# ============================== CONFIG ==============================
import os
from pathlib import Path

COUNTRIES = ["Bangladesh", "Australia"]
EXTRA_COUNTRIES = []            # optional extra training countries, e.g. ["India", "Myanmar"]
MODIS_YEARS = list(range(2001, 2026))   # MODIS C6.1 Terra+Aqua: 2001-2025
VIIRS_YEARS = list(range(2012, 2026))   # VIIRS 375 m S-NPP:     2012-2025
TRY_NOAA20 = False              # also try the (unverified) viirs-noaa20 folder; 404s are just logged
NOAA20_YEARS = list(range(2018, 2026))
FETCH_API_NRT = False           # needs Kaggle Secret FIRMS_MAP_KEY (or env FIRMS_MAP_KEY)
API_NRT_DAYS = 10               # last N days, split into requests of <= 5 days
API_SOURCES = ["VIIRS_SNPP_NRT", "MODIS_NRT"]

WHEELS = ["pennylane", "pennylane-lightning", "onnx", "onnxscript"]   # "xgboost" added below if missing
MAX_WORKERS = 4                 # bounded concurrency (be polite to FIRMS)
MAX_RETRIES = 3                 # retries after the first attempt
TIMEOUT_S = (20, 300)           # (connect, read) seconds
RETRY_AFTER_CAP_S = 300         # never sleep longer than this on one Retry-After
FILE_DEADLINE_S = 1800          # stall guard: total wall-clock cap per request/file (a trickling stream is aborted)
BACKOFF_BUDGET_S = 1800         # overall budget (all files, all workers) for 429/5xx back-off sleeps
CIRCUIT_BREAKER_N = 8           # after this many consecutive 429/5xx responses from one host, stop requesting it
MANIFEST_EVERY_N = 10           # write sources.json every N finished files (crash-safe progress)
USER_AGENT = "LumosFireCalendar/1.0 (NASA Space Apps 2026 education)"

# ---- paths & test overrides (environment variables) ----
WORK = Path(os.environ.get("LUMOS_WORK") or os.environ.get("LUMOS_ROOT") or "/kaggle/working")
BUNDLE = WORK / "lumos_bundle"
FIRMS_BASE = os.environ.get("LUMOS_FIRMS_BASE", "https://firms.modaps.eosdis.nasa.gov").rstrip("/")
NE_BASE = os.environ.get(
    "LUMOS_NE_BASE",
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson").rstrip("/")
SKIP_WHEELS = os.environ.get("LUMOS_SKIP_WHEELS", "0") == "1"
DRY_RUN = os.environ.get("LUMOS_DRY_RUN", "0") == "1"   # list planned downloads, touch nothing
CONTRACT_VERSION = "1.0"

# Pipeline cells run when executed as a notebook/script, not when imported as a module (tests).
RUN_PIPELINE = (__name__ == "__main__") and os.environ.get("LUMOS_A_IMPORT_ONLY", "0") != "1"

# %% [markdown]
# ## Phase 1 · Section 1.3 — Helpers
# **What this cell does:** Imports the libraries and defines the expected FIRMS CSV headers, the two Natural Earth file names, rough country boxes for the optional Area API, a timestamped logger that hides the MAP_KEY, and a SHA-256 helper. Nothing is downloaded.
#
# **Steps**
#
# - [ ] 1.3.1 Run the cell.
# - [ ] 1.3.2 Note that every later log line starts with `[   12.3s]`, the seconds since this cell ran.
#
# **Check before moving on**
#
# - [ ] No `ImportError` (in particular for `requests`).
#
# **If it fails:** An `ImportError` means the image is unusual. Make sure the environment is the default Kaggle image (1.1.5), restart the session and run 1.2 and 1.3 again.
#
# **Time:** estimate: under 5 s

# %%
# ============================== helpers ==============================
import hashlib
import json
import platform
import random
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from urllib.parse import urlparse

import requests

MODIS_COLUMNS = ["latitude", "longitude", "brightness", "scan", "track", "acq_date", "acq_time",
                 "satellite", "instrument", "confidence", "version", "bright_t31", "frp", "daynight", "type"]
VIIRS_COLUMNS = ["latitude", "longitude", "bright_ti4", "scan", "track", "acq_date", "acq_time",
                 "satellite", "instrument", "confidence", "version", "bright_ti5", "frp", "daynight", "type"]
EXPECTED_HEADERS = {
    "modis": MODIS_COLUMNS,
    "viirs": VIIRS_COLUMNS,
    # Area API NRT CSVs have no `type` column
    "modis_api": [c for c in MODIS_COLUMNS if c != "type"],
    "viirs_api": [c for c in VIIRS_COLUMNS if c != "type"],
}
NE_FILES = ["ne_110m_admin_0_countries.geojson", "ne_10m_admin_1_states_provinces.geojson"]
# rough W,S,E,N boxes for the optional Area API
COUNTRY_BBOX = {
    "Bangladesh": (88.0, 20.5, 92.7, 26.7),
    "Australia": (112.9, -43.7, 153.7, -10.6),
    "India": (68.1, 6.7, 97.4, 35.5),
    "Myanmar": (92.2, 9.8, 101.2, 28.6),
}

T0 = time.time()
_MAP_KEY = None            # filled only if FETCH_API_NRT; never printed or written
_PRINT_LOCK = threading.Lock()


def utcnow() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def redact(text):
    """Remove the FIRMS MAP_KEY from any string before it is logged or stored."""
    if text is None:
        return None
    text = str(text)
    if _MAP_KEY:
        text = text.replace(_MAP_KEY, "{MAP_KEY}")
    return text


def log(msg: str) -> None:
    with _PRINT_LOCK:
        print(f"[{time.time() - T0:7.1f}s] {redact(msg)}", flush=True)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def country_slug(name: str) -> str:
    return name.strip().replace(" ", "_")

# %% [markdown]
# ## Phase 1 · Section 1.4 — Polite downloader
# **What this cell does:** Defines the download engine: one HTTP session per worker thread, retries that respect `Retry-After`, a global back-off budget, a per-host circuit breaker, a stall guard for streams that trickle, header and GeoJSON validation, atomic rename of finished files, and a cache that reuses files whose SHA-256 still matches the manifest. Nothing is downloaded yet.
#
# **Steps**
#
# - [ ] 1.4.1 Run the cell.
# - [ ] 1.4.2 Know the behaviour you will see later: a 404 is recorded as `missing`, a 401 or 403 stops all requests to that host, and 429 or 5xx responses are retried up to `MAX_RETRIES` times.
# - [ ] 1.4.3 A file whose first line is not the expected FIRMS header (for example an HTML error page) is rejected and recorded as `error`.
#
# **Check before moving on**
#
# - [ ] The cell finishes with no output and no error.
#
# **If it fails:** An error here almost always means 1.2 or 1.3 was not run first. Run them, then this cell again.
#
# **Time:** estimate: under 1 s

# %%
# ============================== polite downloader ==============================
_tls = threading.local()
_blocked_hosts = {}                 # host -> reason (401/403 seen)
_host_pause_until = {}              # host -> epoch seconds (shared Retry-After)
_host_consecutive_fail = {}         # host -> consecutive 429/5xx count (circuit breaker)
_backoff_spent = [0.0]              # seconds of back-off sleeps granted so far (BACKOFF_BUDGET_S)
_state_lock = threading.Lock()


class StallError(Exception):
    """A single request exceeded FILE_DEADLINE_S of wall-clock time."""


def _grant_backoff(seconds: float) -> bool:
    """Reserve `seconds` from the global back-off budget; False when the budget is exhausted."""
    with _state_lock:
        if _backoff_spent[0] + seconds > BACKOFF_BUDGET_S:
            return False
        _backoff_spent[0] += seconds
        return True


def _note_host_result(host: str, failed: bool) -> bool:
    """Track consecutive 429/5xx per host; returns True if the circuit breaker just tripped."""
    with _state_lock:
        n = _host_consecutive_fail.get(host, 0) + 1 if failed else 0
        _host_consecutive_fail[host] = n
        if failed and n >= CIRCUIT_BREAKER_N and host not in _blocked_hosts:
            _blocked_hosts[host] = f"circuit breaker: {n} consecutive 429/5xx"
            return True
    return False


def get_session() -> requests.Session:
    """One requests.Session per worker thread (Session is not guaranteed thread-safe)."""
    s = getattr(_tls, "session", None)
    if s is None:
        s = requests.Session()
        s.headers.update({"User-Agent": USER_AGENT, "Accept-Encoding": "gzip, deflate"})
        _tls.session = s
    return s


def parse_retry_after(value):
    if not value:
        return None
    value = value.strip()
    try:
        return max(0.0, float(value))
    except ValueError:
        pass
    try:
        dt = parsedate_to_datetime(value)
        return max(0.0, (dt - datetime.now(timezone.utc)).total_seconds())
    except Exception:
        return None


def backoff_seconds(attempt: int, base: float = 2.0, cap: float = 60.0) -> float:
    """Exponential backoff with full jitter: U(0.5, 1.0) * min(cap, base * 2^attempt)."""
    return min(cap, base * (2 ** attempt)) * (0.5 + 0.5 * random.random())


def _wait_for_host(host: str) -> None:
    with _state_lock:
        until = _host_pause_until.get(host, 0.0)
    delay = until - time.time()
    if delay > 0:
        time.sleep(delay)


def _pause_host(host: str, seconds: float) -> None:
    with _state_lock:
        _host_pause_until[host] = max(_host_pause_until.get(host, 0.0), time.time() + seconds)


def validate_csv_header(path: Path, expect: str):
    """Return (ok, note). Exact contract header -> ok; contract columns present with extras/reordering -> ok+note."""
    expected = EXPECTED_HEADERS[expect]
    with open(path, "rb") as f:
        head = f.read(4096)
    try:
        text = head.decode("utf-8-sig")
    except UnicodeDecodeError:
        return False, "not UTF-8 text"
    first = text.splitlines()[0].strip() if text.strip() else ""
    cols = [c.strip().strip('"') for c in first.split(",")]
    if cols == expected:
        return True, ""
    if set(expected) <= set(cols):
        extra = [c for c in cols if c not in expected]
        return True, f"header differs from contract order/extra columns {extra}"
    return False, "unexpected header: " + first[:160].replace("\n", " ")


def validate_geojson(path: Path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            obj = json.load(f)
    except Exception as e:  # noqa: BLE001
        return False, f"invalid JSON: {e}", None
    if obj.get("type") != "FeatureCollection" or not isinstance(obj.get("features"), list):
        return False, "not a GeoJSON FeatureCollection", None
    return True, "", len(obj["features"])


def base_record(job: dict) -> dict:
    return {"id": job["id"], "kind": job["kind"], "url": job["url_redacted"], "local_path": None,
            "sensor": job.get("sensor"), "country": job.get("country"), "year": job.get("year"),
            "http_status": None, "bytes": None, "sha256": None, "rows": None,
            "retrieved_utc": utcnow(), "status": "error", "note": "", "synthetic": False}


def _response_socket(resp):
    """Best-effort handle on the underlying socket (urllib3 1.x/2.x layouts)."""
    import socket as _socket
    for path in (("raw", "_connection", "sock"), ("raw", "_fp", "fp", "raw", "_sock")):
        o = resp
        try:
            for attr in path:
                o = getattr(o, attr)
        except AttributeError:
            continue
        if isinstance(o, _socket.socket):
            return o
    return None


def _stream_to_tmp(resp: requests.Response, tmp: Path, deadline: float = None):
    """Stream body to tmp, return (bytes, sha256, rows).

    Stall guard: the per-read timeout alone never ends a stream that trickles a few bytes per read, and
    iter_content blocks until a whole chunk arrives, so a watchdog timer shuts the socket down at
    `deadline` (epoch s); the blocked read then fails and StallError is raised."""
    import socket as _socket
    h = hashlib.sha256()
    nbytes, newlines, last = 0, 0, b""
    fired = threading.Event()
    timer = None
    if deadline is not None:
        sock = _response_socket(resp)

        def _kill():
            fired.set()
            try:
                if sock is not None:
                    sock.shutdown(_socket.SHUT_RDWR)
                else:
                    resp.close()
            except Exception:  # noqa: BLE001
                pass
        timer = threading.Timer(max(0.0, deadline - time.time()), _kill)
        timer.daemon = True
        timer.start()
    try:
        with open(tmp, "wb") as f:
            for chunk in resp.iter_content(chunk_size=1 << 20):
                if fired.is_set():
                    break
                if not chunk:
                    continue
                f.write(chunk)
                h.update(chunk)
                nbytes += len(chunk)
                newlines += chunk.count(b"\n")
                last = chunk[-1:]
    except Exception as e:  # noqa: BLE001
        if fired.is_set():
            raise StallError(f"stalled: exceeded {FILE_DEADLINE_S}s total for one file ({nbytes} bytes received)") from e
        raise
    finally:
        if timer is not None:
            timer.cancel()
    if fired.is_set():
        raise StallError(f"stalled: exceeded {FILE_DEADLINE_S}s total for one file ({nbytes} bytes received)")
    lines = newlines + (1 if nbytes and last != b"\n" else 0)
    return nbytes, h.hexdigest(), max(lines - 1, 0)


def download(job: dict, previous: dict = None) -> dict:
    """Download one job -> manifest record. Never raises (disk-full / any OSError is recorded per file)."""
    try:
        return _download(job, previous)
    except Exception as e:  # noqa: BLE001  e.g. OSError(ENOSPC) while writing: record, keep going
        rec = base_record(job)
        rec["note"] = redact(f"{type(e).__name__}: {e}")[:300]
        try:
            for t in (BUNDLE / job["local_path"]).parent.glob(Path(job["local_path"]).name + ".part*"):
                t.unlink(missing_ok=True)
        except Exception:  # noqa: BLE001
            pass
        log(f"  ERROR {job['id']}: {rec['note']}")
        return rec


def _download(job: dict, previous: dict = None) -> dict:
    """Download one job -> manifest record.

    job keys: id, kind, url (may contain key), url_redacted, local_path (relative to BUNDLE),
              expect ('modis'|'viirs'|'modis_api'|'viirs_api'|'geojson'), sensor, country, year.
    """
    rec = base_record(job)
    dest = BUNDLE / job["local_path"]
    host = urlparse(job["url"]).netloc
    prev = (previous or {}).get(job["id"])

    # resumable cache: identical file already on disk and recorded as ok
    if prev and prev.get("status") == "ok" and dest.exists() and prev.get("sha256"):
        if sha256_file(dest) == prev["sha256"]:
            out = dict(prev)
            notes = [n for n in (prev.get("note") or "").split("; ") if n and n != "cached"]
            out["note"] = "; ".join(["cached"] + notes)
            return out

    with _state_lock:
        blocked = _blocked_hosts.get(host)
    if blocked:
        rec["note"] = f"skipped: host {host} refused earlier ({blocked})"
        return rec

    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_name(dest.name + f".part{threading.get_ident()}")
    sess = get_session()
    for attempt in range(MAX_RETRIES + 1):
        _wait_for_host(host)
        with _state_lock:
            blocked = _blocked_hosts.get(host)
        if blocked:
            rec["note"] = f"skipped: host {host} refused earlier ({blocked})"
            return rec
        deadline = time.time() + FILE_DEADLINE_S
        try:
            with sess.get(job["url"], stream=True, timeout=TIMEOUT_S) as r:
                rec["http_status"] = r.status_code
                transient = r.status_code in (429, 503) or r.status_code >= 500
                if _note_host_result(host, transient):
                    log(f"  circuit breaker: {CIRCUIT_BREAKER_N} consecutive 429/5xx from {host}; stopping requests to it")
                if r.status_code == 404:
                    rec.update(status="missing", note="404 not found on server")
                    return rec
                if r.status_code in (401, 403):
                    with _state_lock:
                        _blocked_hosts[host] = f"HTTP {r.status_code}"
                    rec["note"] = f"HTTP {r.status_code}; stopping all requests to {host}"
                    return rec
                if r.status_code in (429, 503) or r.status_code >= 500:
                    ra = parse_retry_after(r.headers.get("Retry-After"))
                    wait = min(RETRY_AFTER_CAP_S, ra) if ra is not None else backoff_seconds(attempt)
                    if attempt < MAX_RETRIES and not _grant_backoff(wait):
                        rec["note"] = f"HTTP {r.status_code}; global back-off budget ({BACKOFF_BUDGET_S}s) exhausted"
                        return rec
                    if r.status_code in (429, 503) and ra is not None:
                        _pause_host(host, wait)
                    if attempt < MAX_RETRIES:
                        log(f"  HTTP {r.status_code} for {job['id']}; retry {attempt + 1}/{MAX_RETRIES} in {wait:.1f}s")
                        time.sleep(wait)
                        continue
                    rec["note"] = f"HTTP {r.status_code} after {MAX_RETRIES} retries"
                    return rec
                if r.status_code != 200:
                    rec["note"] = f"unexpected HTTP {r.status_code}"
                    return rec
                nbytes, digest, rows = _stream_to_tmp(r, tmp, deadline)
        except (requests.RequestException, StallError) as e:
            tmp.unlink(missing_ok=True)
            if attempt < MAX_RETRIES:
                wait = backoff_seconds(attempt)
                if not _grant_backoff(wait):
                    rec["note"] = redact(f"{type(e).__name__}: {e}; global back-off budget exhausted")[:300]
                    return rec
                log(f"  {type(e).__name__} for {job['id']}; retry {attempt + 1}/{MAX_RETRIES} in {wait:.1f}s")
                time.sleep(wait)
                continue
            rec["note"] = redact(f"{type(e).__name__}: {e}")[:300]
            return rec

        # ---- validate, then atomic rename ----
        if nbytes == 0:
            tmp.unlink(missing_ok=True)
            rec["note"] = "empty response body"
            return rec
        if job["expect"] == "geojson":
            ok, note, nfeat = validate_geojson(tmp)
            rows = nfeat
        else:
            ok, note = validate_csv_header(tmp, job["expect"])
        if not ok:
            tmp.unlink(missing_ok=True)
            rec["note"] = redact(note)
            return rec
        os.replace(tmp, dest)
        if job["expect"] != "geojson" and rows == 0:
            note = "; ".join(x for x in [note, "header-only file (0 data rows)"] if x)
        rec.update(local_path=job["local_path"], bytes=nbytes, sha256=digest, rows=rows,
                   status="ok", note=redact(note), retrieved_utc=utcnow())
        return rec
    rec["note"] = "retries exhausted"
    return rec


def run_jobs(jobs: list, previous: dict, label: str, on_progress=None) -> list:
    """Run jobs with bounded concurrency; log progress with elapsed time.
    on_progress(records_so_far) is called every MANIFEST_EVERY_N finished files (incremental manifest)."""
    if not jobs:
        log(f"{label}: nothing to do")
        return []
    t = time.time()
    log(f"{label}: {len(jobs)} files, {MAX_WORKERS} workers")
    out = []
    with ThreadPoolExecutor(max_workers=max(1, min(MAX_WORKERS, 8))) as ex:
        futs = {ex.submit(download, j, previous): j for j in jobs}
        for i, fut in enumerate(as_completed(futs), 1):
            rec = fut.result()
            out.append(rec)
            size = f"{(rec['bytes'] or 0) / 1e6:6.2f} MB" if rec["bytes"] else "    -    "
            rows = f"{rec['rows']:>9,} rows" if rec["rows"] is not None else "         - rows"
            log(f"  [{i:>3}/{len(jobs)}] {rec['status']:<7} {rec['id']:<38} {rows} {size}  {rec['note'][:70]}")
            if on_progress is not None and i % MANIFEST_EVERY_N == 0:
                try:
                    on_progress(out)
                except Exception as e:  # noqa: BLE001  (e.g. disk full) never abort the stage
                    log(f"  incremental manifest write failed: {e!r}")
    log(f"{label}: done in {time.time() - t:.1f}s "
        f"(ok={sum(r['status'] == 'ok' for r in out)}, missing={sum(r['status'] == 'missing' for r in out)}, "
        f"error={sum(r['status'] == 'error' for r in out)})")
    return out

# %% [markdown]
# ## Phase 1 · Section 1.5 — Plan the downloads
# **What this cell does:** Defines the job lists (FIRMS yearly country files, the optional Area API requests, the two Natural Earth files) and the functions that read and write `manifests/sources.json`. Nothing is downloaded yet.
#
# **Steps**
#
# - [ ] 1.5.1 Run the cell.
# - [ ] 1.5.2 For reference, each FIRMS file comes from `https://firms.modaps.eosdis.nasa.gov/data/country/<sensor>/<year>/<sensor>_<year>_<Country>.csv` and is saved under `lumos_bundle/raw/firms_country/<sensor>/<year>/`.
#
# **Check before moving on**
#
# - [ ] The cell finishes with no output and no error.
#
# **If it fails:** Run 1.2 to 1.4 first, then this cell again.
#
# **Time:** estimate: under 1 s

# %%
# ============================== job planning ==============================
def firms_country_jobs(countries, modis_years, viirs_years, try_noaa20=False, noaa20_years=()):
    jobs = []
    plan = [("modis", modis_years, "modis"), ("viirs-snpp", viirs_years, "viirs")]
    if try_noaa20:
        plan.append(("viirs-noaa20", noaa20_years, "viirs"))
    for sensor, years, expect in plan:
        for c in countries:
            cs = country_slug(c)
            for y in years:
                fname = f"{sensor}_{y}_{cs}.csv"
                url = f"{FIRMS_BASE}/data/country/{sensor}/{y}/{fname}"
                jobs.append({"id": f"{sensor}_{y}_{cs}", "kind": "firms_country", "url": url,
                             "url_redacted": url, "local_path": f"raw/firms_country/{sensor}/{y}/{fname}",
                             "expect": expect, "sensor": sensor, "country": cs, "year": int(y)})
    return jobs


def area_api_jobs(key, countries, sources, days_back, today=None):
    """FIRMS Area API: /api/area/csv/{KEY}/{SOURCE}/{W,S,E,N}/{1..5}/{YYYY-MM-DD}."""
    today = today or datetime.now(timezone.utc).date()
    start = today - timedelta(days=max(1, days_back) - 1)
    chunks = []
    d = start
    while d <= today:
        n = min(5, (today - d).days + 1)
        chunks.append((d, n))
        d += timedelta(days=n)
    jobs = []
    for src in sources:
        expect = "viirs_api" if src.upper().startswith("VIIRS") else "modis_api"
        for c in countries:
            cs = country_slug(c)
            bbox = COUNTRY_BBOX.get(c) or COUNTRY_BBOX.get(cs)
            if not bbox:
                log(f"  Area API: no bbox for {c}; skipped")
                continue
            area = ",".join(f"{v:g}" for v in bbox)
            for d0, n in chunks:
                tail = f"{src}/{area}/{n}/{d0.isoformat()}"
                jobs.append({"id": f"api_{src}_{cs}_{d0.isoformat()}_{n}d", "kind": "firms_api",
                             "url": f"{FIRMS_BASE}/api/area/csv/{key}/{tail}",
                             "url_redacted": f"{FIRMS_BASE}/api/area/csv/{{MAP_KEY}}/{tail}",
                             "local_path": f"raw/firms_api/{src}/{cs}/{src}_{cs}_{d0.isoformat()}_{n}d.csv",
                             "expect": expect, "sensor": src, "country": cs, "year": d0.year})
    return jobs


def natural_earth_jobs():
    jobs = []
    for fname in NE_FILES:
        url = f"{NE_BASE}/{fname}"
        jobs.append({"id": f"context_{fname.split('.')[0]}", "kind": "context", "url": url, "url_redacted": url,
                     "local_path": f"context/{fname}", "expect": "geojson", "sensor": "natural_earth",
                     "country": None, "year": None})
    return jobs


# ============================== manifest I/O ==============================
def load_previous_manifest() -> dict:
    p = BUNDLE / "manifests" / "sources.json"
    if not p.exists():
        return {}
    try:
        return {r["id"]: r for r in json.loads(p.read_text(encoding="utf-8"))}
    except Exception:  # noqa: BLE001
        return {}


def _sort_key(r):
    order = {"firms_country": 0, "firms_api": 1, "context": 2}
    return (order.get(r.get("kind"), 9), str(r.get("sensor")), str(r.get("country")), r.get("year") or 0, r["id"])


def write_manifest(records: dict) -> Path:
    p = BUNDLE / "manifests" / "sources.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    data = sorted(records.values(), key=_sort_key)
    text = redact(json.dumps(data, indent=1))
    tmp = p.with_name(p.name + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    os.replace(tmp, p)
    return p


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(redact(json.dumps(obj, indent=1, default=str)), encoding="utf-8")

# %% [markdown]
# ## Phase 1 · Section 1.6 — Download FIRMS country archives
# **What this cell does:** Downloads every FIRMS yearly country CSV (MODIS 2001–2025 and VIIRS S-NPP 2012–2025 for each country) with bounded concurrency, validates each file, and writes `manifests/sources.json` every `MANIFEST_EVERY_N` files and at the end. Files already downloaded in an earlier run of this session are reused if their SHA-256 matches.
#
# **Steps**
#
# - [ ] 1.6.1 Run the cell. The first lines show the Python version, the bundle path and the FIRMS and Natural Earth base URLs.
# - [ ] 1.6.2 Look for `FIRMS country archives: 78 files, 4 workers` (2 countries × (25 MODIS + 14 VIIRS) years with the default config).
# - [ ] 1.6.3 Watch the per-file lines `[  i/78] ok|missing|error <id> <rows> <MB> <note>`. Australia files are the largest and take longest.
# - [ ] 1.6.4 Lines like `HTTP 429 for ... retry 1/3 in 12.0s` are normal: the downloader is waiting as FIRMS asked.
# - [ ] 1.6.5 If you see `circuit breaker` or `HTTP 403; stopping all requests`, the remaining files from that host are recorded as `error` with a `skipped: host ... refused earlier` note.
# - [ ] 1.6.6 Wait for the closing line `FIRMS country archives: done in ...s (ok=..., missing=..., error=...)`.
#
# **Check before moving on**
#
# - [ ] The closing line shows `error=0`.
# - [ ] `missing` appears only for files FIRMS really does not have (a 404). They are recorded as missing, never filled with zeros.
# - [ ] Any 2025 file that FIRMS has not filled yet shows `ok`, `0 rows` and the note `header-only file (0 data rows)`. That is expected.
# - [ ] `/kaggle/working/lumos_bundle/manifests/sources.json` exists (Output panel on the right).
#
# **If it fails:** For `error` rows caused by 429, 5xx, timeouts or a tripped circuit breaker, wait a few minutes and run this cell again: good files are reused (note `cached`) and only the failed ones are fetched. For 403, check that Internet is ON. A disk-full error is recorded per file and the run keeps going.
#
# **Time:** estimate: 5–25 min (depends on FIRMS speed; real data not yet tested)

# %%
# ============================== run: FIRMS country archives ==============================
ALL_COUNTRIES = list(dict.fromkeys(COUNTRIES + EXTRA_COUNTRIES))
RUN_STARTED_UTC = utcnow()
RECORDS = {}

if RUN_PIPELINE:
    log(f"Python {platform.python_version()} on {platform.platform()}")
    log(f"Bundle: {BUNDLE}")
    log(f"FIRMS base: {FIRMS_BASE}   Natural Earth base: {NE_BASE}")
    jobs = firms_country_jobs(ALL_COUNTRIES, MODIS_YEARS, VIIRS_YEARS, TRY_NOAA20, NOAA20_YEARS)
    if DRY_RUN:
        log(f"DRY RUN: would download {len(jobs)} FIRMS country files, e.g.")
        for j in jobs[:5]:
            print("   ", j["url_redacted"], "->", j["local_path"])
    else:
        for sub in ["raw/firms_country", "context", "wheelhouse", "manifests"]:
            (BUNDLE / sub).mkdir(parents=True, exist_ok=True)
        PREVIOUS = load_previous_manifest()
        if PREVIOUS:
            log(f"Found previous manifest with {len(PREVIOUS)} records (cache/resume)")
        def _flush_progress(done):
            write_manifest({**PREVIOUS, **RECORDS, **{r["id"]: r for r in done}})
        for r in run_jobs(jobs, PREVIOUS, "FIRMS country archives", on_progress=_flush_progress):
            RECORDS[r["id"]] = r
        write_manifest(RECORDS)

# %% [markdown]
# ## Phase 1 · Section 1.7 — Optional recent NRT data
# **What this cell does:** Only when `FETCH_API_NRT = True` and a MAP_KEY is found: downloads the last `API_NRT_DAYS` days (default 10) of near-real-time VIIRS and MODIS detections from the FIRMS Area API, in requests of at most 5 days. Otherwise it logs that the step is off. The key is never printed or saved.
#
# **Steps**
#
# - [ ] 1.7.1 Run the cell.
# - [ ] 1.7.2 Default setting: look for `Area API (NRT) disabled (FETCH_API_NRT=False).` and move on.
# - [ ] 1.7.3 With the secret: look for `FIRMS MAP_KEY found (value hidden). Fetching recent NRT detections.` followed by `FIRMS Area API (NRT): ... files` and a `done` line.
#
# **Check before moving on**
#
# - [ ] One of the two messages above appears.
# - [ ] If NRT ran, the manifest URLs show `{MAP_KEY}` instead of the key.
#
# **If it fails:** `FETCH_API_NRT=True but no FIRMS_MAP_KEY secret/env found` means the secret is not attached: **Add-ons → Secrets**, tick `FIRMS_MAP_KEY` for this notebook and run the cell again. Or set `FETCH_API_NRT = False`; Notebook B works without NRT data.
#
# **Time:** estimate: under 1 s when off; about 1 min when on

# %%
# ============================== optional: FIRMS Area API (NRT) ==============================
def get_map_key():
    """Kaggle Secret FIRMS_MAP_KEY, else env FIRMS_MAP_KEY, else None. Never printed."""
    try:
        from kaggle_secrets import UserSecretsClient  # type: ignore
        k = UserSecretsClient().get_secret("FIRMS_MAP_KEY")
        if k and k.strip():
            return k.strip()
    except Exception:  # noqa: BLE001  (not on Kaggle, or secret not attached)
        pass
    k = os.environ.get("FIRMS_MAP_KEY", "").strip()
    return k or None


if RUN_PIPELINE and not DRY_RUN:
    if FETCH_API_NRT:
        _MAP_KEY = get_map_key()
        if _MAP_KEY:
            log("FIRMS MAP_KEY found (value hidden). Fetching recent NRT detections.")
            api = area_api_jobs(_MAP_KEY, ALL_COUNTRIES, API_SOURCES, API_NRT_DAYS)
            for r in run_jobs(api, PREVIOUS, "FIRMS Area API (NRT)"):
                RECORDS[r["id"]] = r
            write_manifest(RECORDS)
        else:
            log("FETCH_API_NRT=True but no FIRMS_MAP_KEY secret/env found: skipping Area API.")
    else:
        log("Area API (NRT) disabled (FETCH_API_NRT=False).")

# %% [markdown]
# ## Phase 1 · Section 1.8 — Boundaries
# **What this cell does:** Downloads the two Natural Earth GeoJSON files (world countries; states and provinces) into `lumos_bundle/context/` and checks that each is a valid FeatureCollection.
#
# **Steps**
#
# - [ ] 1.8.1 Run the cell.
# - [ ] 1.8.2 Look for `Natural Earth boundaries: 2 files, 4 workers`, then two `ok` lines with a feature count in the rows column.
#
# **Check before moving on**
#
# - [ ] The closing line shows `ok=2, missing=0, error=0`.
#
# **If it fails:** Run the cell again (it reuses anything already downloaded). Do not move on without these files: Notebook B needs them for the region polygons and the Bangladesh division and New South Wales areas.
#
# **Time:** estimate: under 2 min

# %%
# ============================== Natural Earth boundaries ==============================
if RUN_PIPELINE and not DRY_RUN:
    for r in run_jobs(natural_earth_jobs(), PREVIOUS, "Natural Earth boundaries"):
        RECORDS[r["id"]] = r
    write_manifest(RECORDS)

# %% [markdown]
# ## Phase 1 · Section 1.9 — Offline wheelhouse
# **What this cell does:** Runs `pip download --only-binary=:all:` for PennyLane, PennyLane-Lightning, ONNX and onnxscript (plus XGBoost if it is not installed), one package at a time, into `lumos_bundle/wheelhouse/`. Notebook B installs these with the internet off.
#
# **Steps**
#
# - [ ] 1.9.1 Run the cell. Look for `Wheelhouse: downloading [...] for Python 3.x.y`.
# - [ ] 1.9.2 Watch one line per package: `wheel ok <name>` or `wheel FAILED <name>`.
# - [ ] 1.9.3 Read the closing line `Wheelhouse: N wheel files, X MB`.
#
# **Check before moving on**
#
# - [ ] `pennylane` and `pennylane-lightning` show `wheel ok`.
# - [ ] The wheel count is greater than 0.
#
# **If it fails:** Run the cell again to retry a failed package. If PennyLane still fails, Notebook B still runs: its quantum stage (2.15) falls back to the built-in torch simulator and skips the PennyLane cross-check.
#
# **Time:** estimate: 1–5 min

# %%
# ============================== wheelhouse for offline Notebook B ==============================
import importlib.util


def wheel_list() -> list:
    pkgs = list(WHEELS)
    if importlib.util.find_spec("xgboost") is None and "xgboost" not in pkgs:
        pkgs.append("xgboost")
    return pkgs


def build_wheelhouse(pkgs: list, dest: Path) -> dict:
    """pip download --only-binary=:all: for the running Python; one package per call so failures are isolated."""
    dest.mkdir(parents=True, exist_ok=True)
    info = {"python_version": platform.python_version(), "requested": pkgs, "succeeded": [], "failed": {},
            "files": []}
    for pkg in pkgs:
        t = time.time()
        cmd = [sys.executable, "-m", "pip", "download", "--only-binary=:all:", "--disable-pip-version-check",
               "-q", "-d", str(dest), pkg]
        try:
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=1200)
            if res.returncode == 0:
                info["succeeded"].append(pkg)
                log(f"  wheel ok      {pkg:<22} ({time.time() - t:.1f}s)")
            else:
                info["failed"][pkg] = (res.stderr or res.stdout)[-400:]
                log(f"  wheel FAILED  {pkg:<22} ({time.time() - t:.1f}s): {(res.stderr or '').strip()[-160:]}")
        except Exception as e:  # noqa: BLE001
            info["failed"][pkg] = repr(e)[:400]
            log(f"  wheel FAILED  {pkg}: {e!r}")
    for w in sorted(dest.glob("*.whl")):
        info["files"].append({"name": w.name, "bytes": w.stat().st_size})
    return info


WHEEL_INFO = {"skipped": True, "requested": [], "succeeded": [], "failed": {}, "files": []}
if RUN_PIPELINE and not DRY_RUN:
    if SKIP_WHEELS:
        log("Wheelhouse skipped (LUMOS_SKIP_WHEELS=1).")
    else:
        pk = wheel_list()
        log(f"Wheelhouse: downloading {pk} for Python {platform.python_version()}")
        WHEEL_INFO = build_wheelhouse(pk, BUNDLE / "wheelhouse")
        WHEEL_INFO["skipped"] = False
        log(f"Wheelhouse: {len(WHEEL_INFO['files'])} wheel files, "
            f"{sum(f['bytes'] for f in WHEEL_INFO['files']) / 1e6:.1f} MB")

# %% [markdown]
# ## Phase 1 · Section 1.10 — Manifests and README
# **What this cell does:** Writes `manifests/sources.json` (one record per requested file), `manifests/env_A.json` (Python version, packages, GPU, wheelhouse result), `manifests/config_A.json` (the settings used) and a readable `README_bundle.md`.
#
# **Steps**
#
# - [ ] 1.10.1 Run the cell.
# - [ ] 1.10.2 Look for `Wrote manifests/sources.json, env_A.json, config_A.json, README_bundle.md`.
# - [ ] 1.10.3 Note the Python version in that README (also in `env_A.json`). Notebook B must run on the same version.
#
# **Check before moving on**
#
# - [ ] All four files exist under `/kaggle/working/lumos_bundle/`.
#
# **If it fails:** Usually a disk or permission problem in `/kaggle/working`. Check free disk in the session panel, then run the cell again.
#
# **Time:** estimate: under 10 s

# %%
# ============================== manifests & README ==============================
KEY_PACKAGES = ["requests", "pandas", "numpy", "scipy", "scikit-learn", "pyarrow", "shapely", "xgboost",
                "torch", "onnx", "onnxscript", "onnxruntime", "pennylane", "pennylane-lightning", "transformers"]


def package_versions(names) -> dict:
    from importlib import metadata
    out = {}
    for n in names:
        try:
            out[n] = metadata.version(n)
        except metadata.PackageNotFoundError:
            out[n] = None
    return out


def gpu_name():
    try:
        r = subprocess.run(["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"],
                           capture_output=True, text=True, timeout=20)
        return r.stdout.strip() or None if r.returncode == 0 else None
    except Exception:  # noqa: BLE001
        return None


def env_info() -> dict:
    return {"synthetic": False, "python_version": platform.python_version(), "python_full": sys.version,
            "implementation": platform.python_implementation(), "platform": platform.platform(),
            "machine": platform.machine(), "gpu": gpu_name(),
            "kaggle_kernel_run_type": os.environ.get("KAGGLE_KERNEL_RUN_TYPE"),
            "packages": package_versions(KEY_PACKAGES), "wheelhouse": WHEEL_INFO, "created_utc": utcnow()}


def config_info() -> dict:
    return {"synthetic": False, "contract_version": CONTRACT_VERSION, "COUNTRIES": COUNTRIES,
            "EXTRA_COUNTRIES": EXTRA_COUNTRIES, "MODIS_YEARS": MODIS_YEARS, "VIIRS_YEARS": VIIRS_YEARS,
            "TRY_NOAA20": TRY_NOAA20, "NOAA20_YEARS": NOAA20_YEARS if TRY_NOAA20 else [],
            "FETCH_API_NRT": FETCH_API_NRT, "API_NRT_DAYS": API_NRT_DAYS, "API_SOURCES": API_SOURCES,
            "api_key_used": bool(_MAP_KEY), "WHEELS": WHEELS, "MAX_WORKERS": MAX_WORKERS,
            "MAX_RETRIES": MAX_RETRIES, "USER_AGENT": USER_AGENT, "FIRMS_BASE": FIRMS_BASE, "NE_BASE": NE_BASE,
            "SKIP_WHEELS": SKIP_WHEELS, "run_started_utc": RUN_STARTED_UTC, "run_finished_utc": utcnow()}


def readme_text(records: dict, env: dict) -> str:
    recs = list(records.values())
    fc = [r for r in recs if r["kind"] == "firms_country"]
    ok = [r for r in fc if r["status"] == "ok"]
    miss = sorted(r["id"] for r in fc if r["status"] == "missing")
    err = sorted(f"{r['id']} ({r['note'][:80]})" for r in recs if r["status"] == "error")
    wh = env["wheelhouse"]
    lines = [
        "# Lumos Fire Calendar — data bundle (Notebook A output)", "",
        f"Created {utcnow()} with Python {env['python_version']} ({env['platform']}). Contract v{CONTRACT_VERSION}.",
        "", "## Contents",
        f"- `raw/firms_country/` — NASA FIRMS yearly country CSVs: {len(ok)} ok, {len(miss)} missing, "
        f"{sum(r['status'] == 'error' for r in fc)} error; {sum(r['rows'] or 0 for r in ok):,} detection rows.",
        f"- `raw/firms_api/` — optional Area API NRT files: "
        f"{sum(r['kind'] == 'firms_api' and r['status'] == 'ok' for r in recs)} ok.",
        "- `context/` — Natural Earth `ne_110m_admin_0_countries.geojson`, `ne_10m_admin_1_states_provinces.geojson` "
        "(public domain).",
        f"- `wheelhouse/` — {len(wh.get('files', []))} wheels; succeeded: {wh.get('succeeded')}; "
        f"failed: {list((wh.get('failed') or {}).keys())}; skipped: {wh.get('skipped', False)}.",
        "- `manifests/sources.json` — one record per requested file (url, local_path relative to `lumos_bundle/`, "
        "http_status, bytes, sha256, rows, retrieved_utc, status ok|missing|error, note).",
        "- `manifests/env_A.json`, `manifests/config_A.json` — environment and configuration used.", "",
        "## Rules for Notebook B",
        "- Use only files whose manifest status is `ok`; verify sha256.",
        "- `missing` means FIRMS had no file for that sensor/year/country: treat as **unknown (NaN), never zero**.",
        "- Install wheels offline: `pip install --no-index --find-links <bundle>/wheelhouse pennylane onnx ...`.",
        f"- **A and B must use the same Kaggle image / Python version** (A ran Python {env['python_version']}); "
        "wheels are built for that interpreter.",
        "- No API key is stored anywhere in this bundle (URLs show `{MAP_KEY}`).", "",
        "## Missing files", ", ".join(miss) if miss else "(none)", "",
        "## Errors", "\n".join(f"- {e}" for e in err) if err else "(none)", "",
        "## Acknowledgement",
        "We acknowledge the use of data from NASA's Fire Information for Resource Management System (FIRMS) "
        "(https://earthdata.nasa.gov/firms), part of NASA's Earth Science Data and Information System (ESDIS). "
        "Boundaries from Natural Earth (public domain).", ""]
    return redact("\n".join(lines))


if RUN_PIPELINE and not DRY_RUN:
    ENV = env_info()
    write_manifest(RECORDS)
    write_json(BUNDLE / "manifests" / "env_A.json", ENV)
    write_json(BUNDLE / "manifests" / "config_A.json", config_info())
    (BUNDLE / "README_bundle.md").write_text(readme_text(RECORDS, ENV), encoding="utf-8")
    log("Wrote manifests/sources.json, env_A.json, config_A.json, README_bundle.md")

# %% [markdown]
# ## Phase 1 · Section 1.11 — Summary table
# **What this cell does:** Prints a table of every FIRMS country file (rows: sensor and year; columns: country; cells: `ok <rows>`, `missing` or `error`), then the count of all records by status and the note for every error.
#
# **Steps**
#
# - [ ] 1.11.1 Run the cell.
# - [ ] 1.11.2 Scan the table column by column. MODIS should be `ok` for 2001–2025 and VIIRS S-NPP for 2012–2025.
# - [ ] 1.11.3 Read `All records by status: {...}` and any `ERROR <id> - <note>` lines below it.
#
# **Check before moving on**
#
# - [ ] The table has no `error` cells.
# - [ ] `missing` cells are only years FIRMS does not publish. Write down any you see.
#
# **If it fails:** For `error` cells, run 1.6 again (good files are reused), then 1.7 to 1.11. If an error remains after two tries, note the id and the reason; Notebook B treats it exactly like a missing year (unknown, not zero).
#
# **Time:** estimate: under 5 s

# %%
# ============================== summary table ==============================
import pandas as pd


def summary_table(records: dict) -> pd.DataFrame:
    rows = [r for r in records.values() if r["kind"] == "firms_country"]
    if not rows:
        return pd.DataFrame()
    df = pd.DataFrame(rows)
    df["cell"] = [f"ok {int(r):,}" if s == "ok" else s for s, r in zip(df["status"], df["rows"].fillna(-1))]
    return df.pivot_table(index=["sensor", "year"], columns="country", values="cell", aggfunc="first").fillna("-")


if RUN_PIPELINE and not DRY_RUN:
    with pd.option_context("display.max_rows", 500, "display.width", 200):
        tab = summary_table(RECORDS)
        print(tab.to_string())
    st = pd.Series([r["status"] for r in RECORDS.values()]).value_counts().to_dict()
    log(f"All records by status: {st}")
    errs = [r for r in RECORDS.values() if r["status"] == "error"]
    for r in errs:
        print("  ERROR", r["id"], "-", r["note"][:150])

# %% [markdown]
# ## Phase 1 · Section 1.12 — Final check and Save Version
# **What this cell does:** Prints the size of each top-level folder in the bundle, scans every file for the MAP_KEY (any file that contains it is deleted), removes leftover partial downloads and logs the final instruction. There is no zip: Kaggle keeps `/kaggle/working` as the notebook output.
#
# **Steps**
#
# - [ ] 1.12.1 Run the cell and read the folder sizes (`raw`, `context`, `wheelhouse`, `manifests`, `README_bundle.md`).
# - [ ] 1.12.2 Look for `key leak check: passed`.
# - [ ] 1.12.3 Look for the last line `Done. Outputs are files under /kaggle/working/lumos_bundle (no zip). Now: Save Version -> 'Save & Run All'.`
# - [ ] 1.12.4 Click **Save Version** (top right) → choose **Save & Run All (Commit)** → **Save**. The committed version runs the whole notebook again in a fresh session, so it downloads everything again; that is expected.
# - [ ] 1.12.5 Wait until the version shows as finished successfully (bottom-left version status, or the notebook's **Versions** list).
# - [ ] 1.12.6 Open that version and its **Output** tab, and confirm `lumos_bundle/` is listed.
#
# **Check before moving on**
#
# - [ ] `key leak check: passed`.
# - [ ] `raw` is the largest folder and `context` is not empty.
# - [ ] The committed version's Output tab shows `lumos_bundle/manifests/sources.json`.
#
# **If it fails:** `key leak check: FAILED (offending files removed)` should never happen. Run 1.6 to 1.12 again so the removed files are downloaded again, then commit. If the committed version fails, open its log, fix the cause (usually FIRMS errors) and commit again.
#
# **Time:** estimate: under 1 min for the cell; the commit run takes about as long as the whole notebook (estimate 10–30 min)

# %%
# ============================== final check (no zip: Kaggle keeps /kaggle/working) ==============================
def bundle_sizes() -> dict:
    out = {}
    for p in BUNDLE.rglob("*"):
        if p.is_file():
            top = p.relative_to(BUNDLE).parts[0]
            out[top] = out.get(top, 0) + p.stat().st_size
    return out


def _file_contains(p: Path, needle: bytes, chunk: int = 1 << 22) -> bool:
    """Streamed substring search (constant memory; overlap so a hit across chunk borders is found)."""
    keep = max(len(needle) - 1, 0)
    tail = b""
    with open(p, "rb") as f:
        while True:
            b = f.read(chunk)
            if not b:
                return False
            if needle in tail + b:
                return True
            tail = (tail + b)[-keep:] if keep else b""


def key_leak_check(key: str = None) -> bool:
    """True if the MAP_KEY (if any) appears in NO file of the bundle. Scans every file (any type),
    deletes every offending file, and only then returns False."""
    key = key or _MAP_KEY
    if not key:
        return True
    needle = key.encode()
    hits = []
    for p in sorted(BUNDLE.rglob("*")):
        if p.is_file():
            try:
                if _file_contains(p, needle):
                    hits.append(p)
            except OSError as e:
                log(f"  key leak check could not read {p}: {e!r}")
    for p in hits:
        log(f"!! MAP_KEY found in {p} — removing file")
        p.unlink(missing_ok=True)
    return not hits


if RUN_PIPELINE and not DRY_RUN:
    for top, b in sorted(bundle_sizes().items()):
        print(f"  {top:<22} {b / 1e6:9.2f} MB")
    print("  key leak check:", "passed" if key_leak_check() else "FAILED (offending files removed)")
    # remove stray partial files from interrupted runs
    for p in BUNDLE.rglob("*.part*"):
        p.unlink(missing_ok=True)
    log(f"Done. Outputs are files under {BUNDLE} (no zip). Now: Save Version -> 'Save & Run All'.")

# %% [markdown]
# ## Next phase: Phase 2 — Train in Notebook B
#
# **Check before you continue**
#
# - [ ] The committed version of this notebook finished successfully (see **Versions**).
# - [ ] Its **Output** tab lists `lumos_bundle/manifests/sources.json`.
# - [ ] The summary table (1.11) had no `error` cells, or you wrote down each remaining one.
# - [ ] `key leak check: passed` (1.12).
# - [ ] You noted the Python version from `README_bundle.md`; Notebook B must use the same Kaggle environment.
# - [ ] The wheelhouse has PennyLane wheels (1.9), or you accept that Q1 uses the built-in simulator.
# - [ ] Now open `notebooks/lumos_B_train.ipynb` and start at **Phase 2 · Section 2.1** in its first cell.
