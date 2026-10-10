# Kaggle account probe (K2-ACCOUNT), 2026-10-10

Read-only. Kaggle CLI 2.2.4, auth via env token (not recorded). Calls sequential, >=5 s apart, no 429s seen. No pushes, no competition data downloads, no submissions.

## 1. Own kernels (`kernels list --mine`, 3 pages, 42 rows)
- Owner: `<owner>`. 40 named notebooks (Final_qllm, QML_QLLM, Antenna_LLM_QML, Thesis_Final, Capstone, notebook<hash> ...).
- **No Lumos notebook exists** (`-s lumos` returned "Not found"; none in the full list). Free to use `lumos-probe-*` slugs.
- 2 rows appear as `[Private Notebook]` with empty ref and lastRunTime 2010-04-01 (never-run drafts, hidden from the CLI). The draft "Internet OFF with RTX PRO 6000" is most likely one of them.
- **Draft not pullable.** `kernels pull <owner>/internet-off-with-rtx-pro-6000 -m` and `...-pro-60` both returned HTTP 403 (GetKernel). Control: pulling `<owner>/final-qllm` succeeds, a nonexistent slug also returns 403. So the CLI cannot see the draft (unsaved/never-committed drafts have no API slug). Its true slug is unknown; its metadata could not be read. It is untouched (nothing was pushed).

## 2. KEY FINDING: working RTX PRO 6000 template (`<owner>/final-qllm`, pulled with `-m`, metadata only)
```
"kernel_type": "notebook", "language": "python", "is_private": true,
"enable_gpu": true, "enable_tpu": false, "enable_internet": false,
"dataset_sources": ["<owner>/ml-data"],
"competition_sources": ["arc-prize-2026-arc-agi-3"],
"model_sources": ["qwen-lm/qwen2.5/Transformers/7b-instruct/1"],
"docker_image": "gcr.io/kaggle-images/python@sha256:81b1e7c4...",   (pinned original environment)
"machine_shape": "NvidiaRtxPro6000"
```
- This is a CLI-authored-or-saved kernel that is on the RTX PRO 6000 shape with internet off and the ARC AGI 3 competition attached. It confirms: competition attachable by kernels, and the metadata key/value for the accelerator is `machine_shape: "NvidiaRtxPro6000"` (also settable by `kaggle kernels push --accelerator NvidiaRtxPro6000`; the CLI says allowed names come from an enum not shipped in the SDK).
- SDK only names `NvidiaTeslaP100`, `NvidiaTeslaT4`, `Tpu1VmV38`. The exact string for T4 x2 is NOT verified (candidate: `NvidiaTeslaT4`; check by pulling a T4x2 notebook's metadata or by a tiny probe run).
- Latest run status of final-qllm: `CANCEL_ACKNOWLEDGED` (not touched, just read).
- Pulled copy (metadata + ipynb, not to be pushed) is in scratchpad `pull_ctrl/`. `pull_rtx_draft/` is empty (403).

## 3. Own datasets
`datasets list --mine`: ml-data, thesis-ocr-data, hackathon, trial-12345678, thesis-ocr-src, hackathon1. **None named lumos*** (`-s lumos`: "No datasets found").

## 4. Competition
`competitions list -s arc-prize`: `arc-prize-2026-arc-agi-3`, Featured, deadline 2026-11-02 23:59, 850,000 USD, 4084 teams, **userHasEntered = True** (also entered: arc-agi-2, paper-track, arc-prize-2025). Kernels can attach it (shown by final-qllm). Probe/B notebooks must not read its data nor submit.

## 5. Quota (`kaggle quota` exists and works)
| resource | used | remaining | total | refresh |
|---|---|---|---|---|
| GPU | 0.05 h | 29.95 h | 30 h | 2026-10-17 00:00 |
| TPU | 0.00 h | 20 h | 20 h | 2026-10-17 00:00 |
Matches the owner's screenshot. Probes of a few minutes cost ~0.05 h each.

## 6. Implications for other roles
1. Create the B/probe kernel metadata with `"enable_gpu": true, "enable_internet": false, "competition_sources": ["arc-prize-2026-arc-agi-3"], "machine_shape": "NvidiaRtxPro6000"`, new slug `<owner>/lumos-probe-*`; never reuse `internet-off-...` or any existing slug.
2. Fallback for B: same metadata without the competition and with the T4 shape (name unverified, see above).
3. A (fetch): `enable_internet: true`, `enable_gpu: false`, no competition.
4. Draft notebook cannot be inspected via CLI; rely on final-qllm metadata as ground truth. The owner can confirm the draft's slug in the UI if needed.
5. Weekly GPU refresh is 2026-10-17; budget well within 29.95 h.
