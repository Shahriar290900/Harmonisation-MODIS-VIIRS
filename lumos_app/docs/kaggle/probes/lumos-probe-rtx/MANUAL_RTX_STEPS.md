# Manual RTX PRO 6000 probe (fallback if the CLI push does not give RTX)

Use only if `kaggle kernels push` of this folder is refused, or `kernels pull -m` afterwards shows `machine_shape` is not `NvidiaRtxPro6000`. CLI route is the primary path; K1 confirmed the field name from your existing RTX notebooks, but a CLI-created notebook getting RTX is not yet observed.

1. kaggle.com -> Code -> New Notebook. Do NOT open or edit the draft "Internet OFF with RTX PRO 6000".
2. Right sidebar -> Input -> Add Input -> Competitions -> search `arc-prize-2026-arc-agi-3` -> Add. (Do not click Submit anywhere; probe never reads competition files.)
3. Right sidebar -> Session options -> Internet: OFF.
4. Session options -> Accelerator: choose "RTX PRO 6000" (only listed once the competition input is attached and Internet is off). If absent, re-check steps 2 and 3, then refresh.
5. Session options -> Environment: leave "Pin to original environment" for the first run. If the probe reports `blackwell_torch_ok: false` with `device_is_blackwell: true`, re-run once with the latest environment (Environment dropdown -> Always use latest).
6. Rename the notebook `lumos-probe-rtx-manual`. Paste the entire contents of `probe.py` into one code cell. Run All (about 2 minutes of GPU quota).
7. Read the printed `verdict` block and download `/kaggle/working/probe_rtx.json` from the Output tab; save it to `lumos_app/docs/kaggle/probes/out-rtx/`.
8. Stop the session (Session options -> Stop) so quota is not used while idle.
