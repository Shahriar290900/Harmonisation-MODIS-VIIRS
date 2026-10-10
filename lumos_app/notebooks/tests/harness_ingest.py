"""Adapted from review/scratch/harness_ingest.py (marker-based exec)."""
"""Exec Notebook B up to the ingest function definitions, then feed crafted real-format CSVs to ingest_file."""
import os, sys, tempfile, numpy as np, pandas as pd
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "lumos_B_train.py")
# exec the cells up to (excluding) the INGEST cell's run block: defs only (marker-based; was: first 459 lines)
text = open(SRC, encoding="utf-8").read()
upto = text.index("INGEST_DIR = RUN_DIR / \"ingest\"")
ns = {"__name__": "__main__"}
exec(compile(text[:upto], SRC, "exec"), ns)
ns["WRITE_DETECTIONS_PARQUET"] = True
d = tempfile.mkdtemp()
H_V = "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight,type"
H_M = "latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight,type"

def run(name, header, body, sensor):
    p = os.path.join(d, name); open(p, "w").write(header + "\n" + body)
    try:
        agg, q, st = ns["ingest_file"]({"_path": p, "sensor": sensor, "id": name})
        print(f"{name}: rows_raw={st['rows_raw']} quarantined={st['quarantined']} max_ym={st['max_ym']} last_date={st.get('last_date')} nrt={st.get('nrt_rows')} plat_rows={st.get('platform_month_rows')}")
        if q is not None: print("   quarantine:", q["quarantine_reason"].tolist())
        return agg, st
    except Exception as e:
        print(f"{name}: EXCEPTION {e!r}")

run("empty_viirs.csv", H_V, "", "viirs-snpp")
run("empty_modis.csv", H_M, "", "modis")
body = "\n".join([
    "-33.5,150.1,330.1,0.4,0.37,2020-01-31,5,N,VIIRS,n,2,290.1,3.2,N,0",       # 00:05 -> Jan
    "-33.5,150.1,330.1,0.4,0.37,2020-01-31,2359,N,VIIRS,h,2.0NRT,290.1,3.2,N,0",
    "-33.5,150.1,330.1,0.4,0.37,2020-02-01,730,N20,VIIRS,l,2,290.1,3.2,D,0",
    "-33.5,150.1,330.1,0.4,0.37,2020-02-01,730,NOAA-20,VIIRS,l,2,290.1,3.2,D,0",
    "-33.5,150.1,330.1,0.4,0.37,2020-02-01,730,1,VIIRS,l,2,290.1,3.2,D,2",
    "-33.5,150.1,330.1,0.4,0.37,2020-02-01,730,J1,VIIRS,l,2,290.1,3.2,D,0",
])
agg, st = run("viirs_mixed.csv", H_V, body + "\n", "viirs-snpp")
print(agg.assign(plat=[ns["PLATFORMS"][i] for i in agg.platform], y=agg.ym // 12, m=agg.ym % 12 + 1)[["plat", "y", "m", "count", "static", "nrt"]].to_string())
# type rule (v1.2): type==0 standard → main; type!=0 standard → static; NRT rows (version contains NRT) → never counted, tracked in `nrt`
_a = agg.assign(plat=[ns["PLATFORMS"][i] for i in agg.platform], m=agg.ym % 12 + 1)
assert int(_a.loc[(_a.plat == "snpp") & (_a.m == 1), "count"].sum()) == 1 and int(_a.loc[(_a.plat == "snpp") & (_a.m == 1), "nrt"].sum()) == 1, "Jan: 1 standard row counted, the 2.0NRT row only in `nrt`"
assert int(_a.loc[(_a.plat == "noaa20") & (_a.m == 2), "static"].sum()) == 1 and int(_a.loc[(_a.plat == "noaa20") & (_a.m == 2), "count"].sum()) == 3, "Feb NOAA-20: 3 type-0 rows, the type-2 row is static"
print("type rule asserts passed (NRT row never counted)")
mbody = "\n".join(["23.8,90.4,320.1,1.0,1.0,2010-03-01,45,Aqua,MODIS,67,6.1,300.1,10.2,D,0",
                   "23.8,90.4,320.1,1.0,1.0,2010-03-01,45,Aqua,MODIS,67,6.03,300.1,10.2,D,0",
                   "23.8,90.4,320.1,1.0,1.0,2010-03-01,45,Aqua,MODIS,67,61.03,300.1,10.2,D,0",
                   "23.8,90.4,320.1,1.0,1.0,2010-03-01,45,Aqua,MODIS,67,61.03,300.1,10.2,D,0",
                   "23.8,90.4,320.1,1.0,1.0,2010-03-01,0045,Aqua,MODIS,67,6.1,300.1,10.2,D,0"])
agg, st = run("modis_versions.csv", H_M, mbody + "\n", "modis")
print("modis exact dups removed:", st["exact_duplicates_removed"], " counted:", int(agg["count"].sum()))
# parse check of acq_time on its own
for t in ["5", "730", "0005", "1200", "5.0"]:
    s = pd.Series([t]).str.strip().str.replace(r"\.0+$", "", regex=True).str.zfill(4)
    print("acq_time", repr(t), "->", pd.to_datetime("2020-01-01 " + s, format="%Y-%m-%d %H%M", utc=True)[0])
