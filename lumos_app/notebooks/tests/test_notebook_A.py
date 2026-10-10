#!/usr/bin/env python3
"""End-to-end + unit tests for Notebook A against a local FIRMS/Natural Earth mirror.

1. Builds a mirror directory with the FIRMS URL layout (data/country/{sensor}/{year}/...) from the
   synthetic fixture bundle (fixtures/out/lumos_bundle), plus Natural Earth stand-ins under ne/.
   Missing on purpose: VIIRS-SNPP 2016 Australia (-> 404 -> "missing"). The fixture's 2025 files are an
   incomplete current year; viirs-snpp 2025 Bangladesh is header-only (-> ok, 0 rows, noted).
   Default countries are Bangladesh, Australia and United_States (3 x 39 = 117 FIRMS files).
   Corrupted on purpose: viirs-snpp 2013 Bangladesh is an HTML page (-> "error").
2. Serves it with `python -m http.server`, executes the generated lumos_A_fetch.ipynb with nbconvert
   (LUMOS_FIRMS_BASE / LUMOS_NE_BASE / LUMOS_SKIP_WHEELS=1 / LUMOS_WORK=tmp) and checks the manifest.
3. Re-executes to check the resumable cache.
4. Imports the .py as a module and unit-tests 429+Retry-After, 403 host stop, 5xx retries,
   bad header, MAP_KEY redaction, stall guard (trickling stream), global back-off budget,
   circuit breaker, disk-full per file (keeps going) and the all-files key-leak scan.

Usage: python test_notebook_A.py [--keep]
"""
import importlib.util
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
NOTEBOOKS = HERE.parent
LUMOS = HERE.parents[1]
FIXTURE = LUMOS / "fixtures" / "out" / "lumos_bundle"
NB = NOTEBOOKS / "lumos_A_fetch.ipynb"
PY = NOTEBOOKS / "lumos_A_fetch.py"


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


def make_mirror(root: Path):
    src = json.loads((FIXTURE / "manifests" / "sources.json").read_text())
    for r in src:
        if r["status"] != "ok" or r["kind"] == "firms_api":
            continue
        if r["kind"] == "firms_country":
            dst = root / "data" / "country" / r["sensor"] / str(r["year"]) / Path(r["local_path"]).name
        else:
            dst = root / "ne" / Path(r["local_path"]).name
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(FIXTURE / r["local_path"], dst)
    bad = root / "data/country/viirs-snpp/2013/viirs-snpp_2013_Bangladesh.csv"
    bad.write_text("<html><body>Service temporarily unavailable</body></html>\n")
    return {r["id"]: r for r in src}


def wait_port(port, timeout=10):
    t = time.time()
    while time.time() - t < timeout:
        try:
            socket.create_connection(("127.0.0.1", port), timeout=0.5).close()
            return
        except OSError:
            time.sleep(0.1)
    raise RuntimeError("server did not start")


def execute_notebook(env, out_dir: Path, name: str) -> str:
    cmd = [sys.executable, "-m", "jupyter", "nbconvert", "--to", "notebook", "--execute",
           "--ExecutePreprocessor.timeout=600", "--output-dir", str(out_dir), "--output", name, str(NB)]
    t = time.time()
    res = subprocess.run(cmd, env=env, capture_output=True, text=True)
    if res.returncode != 0:
        print(res.stdout[-3000:], res.stderr[-6000:])
        raise SystemExit("notebook execution FAILED")
    nb = json.loads((out_dir / name).read_text())
    text = "".join("".join(o.get("text", "")) for c in nb["cells"] if c["cell_type"] == "code"
                   for o in c.get("outputs", []) if o.get("output_type") == "stream")
    print(f"  executed {name} in {time.time() - t:.1f}s")
    return text


def check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print("  PASS", msg)


def e2e(tmp: Path):
    print("== end-to-end: execute notebook against local mirror ==")
    mirror = tmp / "mirror"
    fx = make_mirror(mirror)
    port = free_port()
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1",
                            "--directory", str(mirror)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        wait_port(port)
        work = tmp / "work"
        env = dict(os.environ, LUMOS_WORK=str(work), LUMOS_FIRMS_BASE=f"http://127.0.0.1:{port}",
                   LUMOS_NE_BASE=f"http://127.0.0.1:{port}/ne", LUMOS_SKIP_WHEELS="1")
        env.pop("FIRMS_MAP_KEY", None)
        out1 = execute_notebook(env, tmp, "run1.ipynb")
        b = work / "lumos_bundle"
        man = json.loads((b / "manifests" / "sources.json").read_text())
        by = {r["id"]: r for r in man}
        fc = [r for r in man if r["kind"] == "firms_country"]
        check(len(fc) == 3 * (25 + 14), f"{len(fc)} FIRMS country records (3 countries x 39 sensor-years)")
        check(all(by[f"{s}_2025_{c}"]["status"] == "ok" for s in ("modis", "viirs-snpp")
                  for c in ("Bangladesh", "Australia", "United_States")), "2025 (current-year) files fetched")
        us = by["viirs-snpp_2020_United_States"]
        check(us["status"] == "ok" and us["country"] == "United_States" and us["rows"]
              and us["url"] == f"http://127.0.0.1:{port}/data/country/viirs-snpp/2020/viirs-snpp_2020_United_States.csv"
              and us["local_path"] == "raw/firms_country/viirs-snpp/2020/viirs-snpp_2020_United_States.csv"
              and (b / us["local_path"]).exists(),
              "United_States: underscore name in id, URL, local_path and manifest country")
        check(sorted({r["country"] for r in fc}) == ["Australia", "Bangladesh", "United_States"],
              "manifest countries = Bangladesh, Australia, United_States")
        h0 = by["viirs-snpp_2025_Bangladesh"]
        check(h0["rows"] == 0 and "header-only" in h0["note"], "header-only 2025 file -> ok, 0 rows, noted")
        check(by["viirs-snpp_2016_Australia"]["status"] == "missing"
              and by["viirs-snpp_2016_Australia"]["http_status"] == 404, "VIIRS 2016 Australia -> missing (404)")
        r = by["viirs-snpp_2013_Bangladesh"]
        check(r["status"] == "error" and "unexpected header" in r["note"]
              and not (b / "raw/firms_country/viirs-snpp/2013/viirs-snpp_2013_Bangladesh.csv").exists(),
              "HTML body -> error, file not kept")
        oks = [r for r in fc if r["status"] == "ok"]
        n_fx = sum(1 for r in fx.values() if r["kind"] == "firms_country" and r["status"] == "ok")
        check(len(oks) == n_fx - 1, f"{len(oks)} ok files (fixture {n_fx} minus corrupted one)")
        check(all(r["sha256"] == fx[r["id"]]["sha256"] and r["rows"] == fx[r["id"]]["rows"]
                  and r["bytes"] == fx[r["id"]]["bytes"] for r in oks), "sha256/rows/bytes match fixture")
        check(all((b / r["local_path"]).exists() for r in oks), "all ok files present at local_path")
        ctx = [r for r in man if r["kind"] == "context"]
        check(len(ctx) == 2 and all(r["status"] == "ok" and r["rows"] for r in ctx), "Natural Earth ok")
        check(all((b / "manifests" / f).exists() for f in ("env_A.json", "config_A.json"))
              and (b / "README_bundle.md").exists(), "env_A/config_A/README written")
        check(not list(b.rglob("*.part*")), "no partial files")
        check("Summary" in out1 or "Bangladesh" in out1, "summary table printed")
        check("United_States" in out1 and "FIRMS country archives: 117 files" in out1,
              "run log shows the 117-file plan and a United_States summary column")
        cfg = json.loads((b / "manifests" / "config_A.json").read_text())
        check(cfg["SKIP_WHEELS"] is True and cfg["api_key_used"] is False, "config_A flags recorded")
        out2 = execute_notebook(env, tmp, "run2.ipynb")
        man2 = json.loads((b / "manifests" / "sources.json").read_text())
        cached = [r for r in man2 if r["status"] == "ok" and r["note"].startswith("cached")]
        check(len(cached) == len(oks) + 2, f"second run served {len(cached)} files from cache")
        print("\n--- tail of run1 output ---\n" + "\n".join(out1.splitlines()[-60:]))
    finally:
        srv.terminate()
        srv.wait()


# ---------------------------------------------------------------- unit tests
class Scripted(BaseHTTPRequestHandler):
    hits = {}
    body = b""

    def log_message(self, *a):
        pass

    def do_GET(self):
        n = Scripted.hits.get(self.path, 0) + 1
        Scripted.hits[self.path] = n
        p = self.path
        if p.startswith("/r429"):
            if n == 1:
                self.send_response(429)
                self.send_header("Retry-After", "1")
                self.end_headers()
                return
        elif p.startswith("/r503"):
            if n <= 2:
                self.send_response(503)
                self.end_headers()
                return
        elif p.startswith("/r500"):
            self.send_response(500)
            self.end_headers()
            return
        elif p.startswith("/html"):
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"<html>nope</html>")
            return
        elif p.startswith("/api"):
            self.send_response(404)
            self.end_headers()
            return
        elif p.startswith("/slow"):
            self.send_response(200)
            self.send_header("Content-Length", str(len(Scripted.body)))
            self.end_headers()
            try:
                for i in range(0, 400, 20):          # trickle: 20 bytes every 0.2 s, never finishes in time
                    self.wfile.write(Scripted.body[i:i + 20])
                    self.wfile.flush()
                    time.sleep(0.2)
            except Exception:
                pass
            return
        elif p.startswith("/always429"):
            self.send_response(429)
            self.send_header("Retry-After", "1")
            self.end_headers()
            return
        self.send_response(200)
        self.send_header("Content-Length", str(len(Scripted.body)))
        self.end_headers()
        self.wfile.write(Scripted.body)


class Scripted403(Scripted):
    def do_GET(self):
        Scripted.hits[self.path] = Scripted.hits.get(self.path, 0) + 1
        self.send_response(403)
        self.end_headers()


def unit(tmp: Path):
    print("== unit tests: polite downloader ==")
    os.environ["LUMOS_WORK"] = str(tmp / "unit")
    spec = importlib.util.spec_from_file_location("lumos_A_fetch", PY)
    A = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(A)
    check(A.RUN_PIPELINE is False, "import does not run the pipeline")
    A.backoff_seconds = lambda attempt, base=2.0, cap=60.0: 0.05
    csv = next((FIXTURE / "raw/firms_country/modis/2005").glob("*.csv"))
    Scripted.body = csv.read_bytes()
    srv = ThreadingHTTPServer(("127.0.0.1", 0), Scripted)
    srv403 = ThreadingHTTPServer(("127.0.0.1", 0), Scripted403)
    for s in (srv, srv403):
        threading.Thread(target=s.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{srv.server_address[1]}"
    base403 = f"http://127.0.0.1:{srv403.server_address[1]}"

    def job(path, i, expect="modis", b=base):
        u = f"{b}{path}"
        return {"id": f"t{i}", "kind": "firms_country", "url": u, "url_redacted": u,
                "local_path": f"raw/t/{i}.csv", "expect": expect, "sensor": "modis", "country": "X", "year": 2005}

    t = time.time()
    r = A.download(job("/r429/a.csv", 1))
    check(r["status"] == "ok" and Scripted.hits["/r429/a.csv"] == 2 and time.time() - t >= 0.9,
          "429 + Retry-After: waited ~1s then succeeded")
    r = A.download(job("/r503/a.csv", 2))
    check(r["status"] == "ok" and Scripted.hits["/r503/a.csv"] == 3, "503 twice then ok")
    r = A.download(job("/r500/a.csv", 3))
    check(r["status"] == "error" and Scripted.hits["/r500/a.csv"] == 1 + A.MAX_RETRIES,
          f"500 -> error after {A.MAX_RETRIES} retries")
    r = A.download(job("/html/a.csv", 4))
    check(r["status"] == "error" and "unexpected header" in r["note"], "HTML 200 -> error")
    r = A.download(job("/x/viirs.csv", 5, expect="viirs"))
    check(r["status"] == "error", "MODIS body for VIIRS job -> error (header check)")
    r1 = A.download(job("/f1.csv", 6, b=base403))
    r2 = A.download(job("/f2.csv", 7, b=base403))
    check(r1["status"] == "error" and r1["http_status"] == 403 and "skipped" in r2["note"]
          and "/f2.csv" not in Scripted.hits, "403 stops further requests to that host")
    ok = A.download(job("/plain.csv", 8))
    prev = {"t8": ok}
    hits = Scripted.hits.get("/plain.csv")
    again = A.download(job("/plain.csv", 8), prev)
    check(again["note"].startswith("cached") and Scripted.hits.get("/plain.csv") == hits, "cache hit skips request")
    # redaction of MAP_KEY
    A._MAP_KEY = "SECRET_KEY_123456"
    jobs = A.area_api_jobs(A._MAP_KEY, ["Bangladesh"], ["VIIRS_SNPP_NRT"], 12)
    check(len(jobs) == 3 and [j["url"].split("/")[-2] for j in jobs] == ["5", "5", "2"],
          "Area API: 12 days -> chunks of 5,5,2")
    # United_States: default config, bbox for the optional NRT step, underscore and space spellings
    check(A.COUNTRIES == ["Bangladesh", "Australia", "United_States"], "default COUNTRIES include United_States")
    check(A.country_slug("United States") == "United_States" == A.country_slug(" United_States "),
          "country_slug: space -> underscore")
    uj = A.area_api_jobs("SECRETK123", ["United_States"], ["VIIRS_SNPP_NRT"], 5, today=A.datetime(2025, 9, 10).date())
    uj2 = A.area_api_jobs("SECRETK123", ["United States"], ["VIIRS_SNPP_NRT"], 5, today=A.datetime(2025, 9, 10).date())
    w, so, e, n = A.COUNTRY_BBOX["United_States"]
    check(len(uj) == 1 and uj[0]["id"] == "api_VIIRS_SNPP_NRT_United_States_2025-09-06_5d"
          and "/-179.2,18.9,-66.9,71.5/5/2025-09-06" in uj[0]["url"] and uj[0]["country"] == "United_States"
          and uj[0]["local_path"] == "raw/firms_api/VIIRS_SNPP_NRT/United_States/VIIRS_SNPP_NRT_United_States_2025-09-06_5d.csv"
          and [j["id"] for j in uj2] == [j["id"] for j in uj] and w < -125 and e > -67 and so < 20 and n > 70,
          "Area API United_States: one box covering CONUS+AK+HI, underscore id/path, same for 'United States'")
    check("SECRETK123" not in uj[0]["url_redacted"] and "{MAP_KEY}" in uj[0]["url_redacted"],
          "Area API United_States: key redacted in url_redacted")
    fj = A.firms_country_jobs(A.COUNTRIES, A.MODIS_YEARS, A.VIIRS_YEARS)
    check(len(fj) == 117 and sum(j["country"] == "United_States" for j in fj) == 39
          and any(j["url"].endswith("/data/country/modis/2020/modis_2020_United_States.csv") for j in fj)
          and any(j["url"].endswith("/data/country/viirs-snpp/2020/viirs-snpp_2020_United_States.csv") for j in fj),
          "firms_country_jobs: 117 default jobs, United_States URLs match FIRMS file names")
    st = A.summary_table({j["id"]: dict(j, status="ok", rows=5) for j in fj if j["year"] == 2020})
    check(list(st.columns) == ["Australia", "Bangladesh", "United_States"], "summary_table has a United_States column")
    A.FIRMS_BASE = base
    jobs = [dict(j, url=j["url"].replace(j["url"].split("/api/")[0], base),
                 url_redacted=j["url_redacted"]) for j in jobs]
    recs = A.run_jobs(jobs[:1], {}, "api-test")
    dead = dict(jobs[0], id="dead", url=f"http://127.0.0.1:{free_port()}/api/area/csv/{A._MAP_KEY}/x")
    recs += [A.download(dead)]
    A.RECORDS = {r["id"]: r for r in recs}
    p = A.write_manifest(A.RECORDS)
    text = p.read_text()
    check("SECRET_KEY_123456" not in text and "{MAP_KEY}" in text, "MAP_KEY redacted in manifest")
    check(A.redact("x SECRET_KEY_123456 y") == "x {MAP_KEY} y", "redact() works")
    # ---- stall guard: a trickling stream is aborted after FILE_DEADLINE_S of total wall-clock ----
    A._MAP_KEY = None
    A.FILE_DEADLINE_S = 1.0
    A.MAX_RETRIES = 0
    t = time.time()
    r = A.download(job("/slow/a.csv", 20))
    check(r["status"] == "error" and "stalled" in r["note"] and time.time() - t < 4,
          f"stall guard aborted trickling stream after {time.time() - t:.1f}s")
    A.FILE_DEADLINE_S = 1800
    # ---- global back-off budget ----
    A.MAX_RETRIES = 3
    A.BACKOFF_BUDGET_S = 0.5
    A._backoff_spent[0] = 0.0
    t = time.time()
    r = A.download(job("/always429/a.csv", 21))
    check(r["status"] == "error" and "budget" in r["note"] and time.time() - t < 1.0,
          "429 with exhausted back-off budget -> error without sleeping")
    A.BACKOFF_BUDGET_S = 1800
    # ---- circuit breaker: N consecutive 429/5xx from one host stop further requests ----
    A.CIRCUIT_BREAKER_N = 3
    A.MAX_RETRIES = 5
    A.RETRY_AFTER_CAP_S = 0.01
    before = Scripted.hits.get("/always429/b.csv", 0)
    r = A.download(job("/always429/b.csv", 22))
    hits_b = Scripted.hits.get("/always429/b.csv", 0) - before
    r2 = A.download(job("/plain.csv", 23))
    check(hits_b <= 3 and "circuit breaker" in r2["note"], f"circuit breaker tripped after {hits_b} requests")
    with A._state_lock:
        A._blocked_hosts.clear()
        A._host_consecutive_fail.clear()
    A.CIRCUIT_BREAKER_N = 8
    A.MAX_RETRIES = 3
    A.RETRY_AFTER_CAP_S = 300
    # ---- disk full while writing one file: recorded as error, next file still downloads ----
    real_stream = A._stream_to_tmp

    def full_disk(resp, tmp, deadline=None):
        Path(tmp).write_bytes(b"partial")
        raise OSError(28, "No space left on device")
    A._stream_to_tmp = full_disk
    r = A.download(job("/plain2.csv", 24))
    A._stream_to_tmp = real_stream
    left = list((A.BUNDLE / "raw/t").glob("24.csv.part*"))
    r2 = A.download(job("/plain3.csv", 25))
    check(r["status"] == "error" and "No space left" in r["note"] and not left and r2["status"] == "ok",
          "disk-full OSError -> per-file error, partial removed, next file ok")
    # ---- key-leak check scans ALL files (any suffix) and removes every hit ----
    A._MAP_KEY = "SECRET_KEY_123456"
    leak1 = A.BUNDLE / "manifests" / "a_leak.json"
    leak2 = A.BUNDLE / "raw" / "t" / "b_leak.parquet"
    big = A.BUNDLE / "raw" / "t" / "c_border.bin"
    leak1.parent.mkdir(parents=True, exist_ok=True)
    leak1.write_text('{"u": "SECRET_KEY_123456"}')
    leak2.write_bytes(b"\x00binary SECRET_KEY_123456 \x00")
    big.write_bytes(b"x" * ((1 << 22) - 5) + b"SECRET_KEY_123456")   # straddles the 4 MiB chunk border
    ok_leak = A.key_leak_check()
    check(ok_leak is False and not leak1.exists() and not leak2.exists() and not big.exists(),
          "key-leak check found and removed all 3 offending files (json, binary, chunk-border)")
    check(A.key_leak_check() is True, "key-leak check passes once clean")
    A._MAP_KEY = None
    srv.shutdown()
    srv403.shutdown()


def main():
    keep = "--keep" in sys.argv
    assert FIXTURE.exists(), "run fixtures/make_fixture_bundle.py first"
    subprocess.run([sys.executable, str(NOTEBOOKS / "build_ipynb_A.py")], check=True)
    tmp = Path(tempfile.mkdtemp(prefix="lumosA_test_"))
    try:
        unit(tmp)
        e2e(tmp)
        print("\nALL TESTS PASSED")
    finally:
        if keep:
            print("kept", tmp)
        else:
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
