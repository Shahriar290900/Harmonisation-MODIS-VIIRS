# 🔥 Lumos Fire Calendar
> NASA Space Apps 2026 entry, challenge *Harmonization of MODIS and VIIRS Hot Spots*. 
> **Team Lumos**, Dhaka. Owner: M. Al Shahriar Hameem.

[![Deploy to GitHub Pages](https://github.com/Shahriar290900/Harmonisation-MODIS-VIIRS/actions/workflows/pages.yml/badge.svg)](https://github.com/Shahriar290900/Harmonisation-MODIS-VIIRS/actions/workflows/pages.yml)

### 🌍 **Live App Link**: [https://Shahriar290900.github.io/Harmonisation-MODIS-VIIRS/](https://Shahriar290900.github.io/Harmonisation-MODIS-VIIRS/)

**Pick a place. See its burning seasons over 20+ years on one fair scale. Tell real change apart from satellite change.**

---

## 📸 Application Screenshots

### Hero & Interactive Workspace
The application starts with a powerful storytelling hero and transitions into a full interactive workspace for data analysis.

![Desktop Hero](for%20Chatgpt/assets/desktop-landing-hero.png)
![Desktop Workspace](for%20Chatgpt/assets/desktop-workspace.png)

### Mobile Experience
Fully responsive and touch-optimized, the progressive web app (PWA) looks great on any device.

<p align="center">
  <img src="for%20Chatgpt/assets/mobile-landing-hero.png" width="30%">
  <img src="for%20Chatgpt/assets/mobile-workspace.png" width="30%">
  <img src="for%20Chatgpt/assets/mobile-landing-how.png" width="30%">
</p>

### How it Works
A visual guide to understanding the harmonization process between Terra/Aqua MODIS and S-NPP VIIRS datasets.

![How it works](for%20Chatgpt/assets/desktop-landing-how.png)
![Aqua Terra Render](for%20Chatgpt/assets/aqua_terra_satellite_render.png)

---

## 🎯 The Science & The Goal

MODIS (about 1 km pixels, since 2000) and VIIRS (375 m pixels, since 2012) report different numbers of fire hotspots for the same place, so a joined chart jumps in 2012 even when nothing changed. 

This project learns the relationship between Aqua-MODIS and S-NPP VIIRS on the years both flew, tests it on years and places it has not seen, and uses it to turn MODIS-era counts into **VIIRS-scale estimates with an error band**. 

> **Important Caveat**: A hotspot is a hot pixel, not a fire incident, and the project does not claim to count wildfires or see through clouds.

## 🗺️ Supported Regions
| Region | Areas | Detailed view |
|---|---|---|
| **Bangladesh** (default) | country + 7 divisions | country |
| **Australia** | country + New South Wales | New South Wales |
| **United States** | country + California | California |

Whole-country Australia and United States show totals only. Detailed 5 km cell maps are made for Bangladesh, New South Wales and California.

## 📁 Repository Structure
| Path | What it holds |
|---|---|
| `lumos_app/` | The app (React + Vite + MapLibre + Three.js PWA), the data contract (`CONTRACT.md`), product requirements (`PRD.md`), status (`STATUS.md`), notebook sources, scripts, tests and a synthetic demo snapshot |
| `kaggle_notebooks/` | `lumos_A_fetch.ipynb` (downloads data, internet ON) and `lumos_B_train.ipynb` (trains and exports, internet OFF, GPU), plus `STEP_INDEX.md` |
| `RUNBOOK.md` | Step-by-step guide, 9 phases |
| `KAGGLE_HANDOFF.md` | Short click-by-click guide for running both notebooks on Kaggle |
| `START_HERE.md` | Orientation for the whole package |
| `prompts/`, `references/` | Claude Code prompts; the original PRD and prompt |

## 🚀 Run the app locally
Needs Node.js 20 or newer.
```bash
cd lumos_app
npm install
npm run dev          # http://localhost:5173
npm test             # unit tests
```
*Note: The bundled snapshot is **synthetic** (real format, fake numbers) and the app shows a DEMO DATA banner while it is loaded.*

## 🔬 Real data: the Kaggle flow
1. **Notebook A** (internet ON, CPU): requests 117 NASA FIRMS yearly country files (3 countries × (25 MODIS + 14 VIIRS) years) and Natural Earth boundaries. 
2. **Notebook B** (internet OFF): attach A's output, run all, download `lumos_app_bundle.zip`. Covers Bangladesh, Australia (+NSW) and the United States (+California). Two GPU options: T4 x2 or RTX PRO 6000 (see `KAGGLE_HANDOFF.md`).
3. **Import**: `cd lumos_app && node scripts/import_bundle.mjs <path-to>/lumos_app_bundle.zip` checks checksums and schema and makes it the default snapshot.

Exact clicks and what to send back on failure: `KAGGLE_HANDOFF.md`.

## ⚖️ Honesty statement
- The data in the app today is synthetic. Notebooks A and B have not been run on real FIRMS data on Kaggle, and the app has not been tested on real phones. Test results so far are plumbing checks on synthetic data, not scientific results.
- A hotspot is a hot pixel, not a wildfire: in the United States file it includes prescribed and agricultural burning, and the file covers Alaska and Hawaii too. Burned-area products are not independent checks of hotspots.
- The release stage is currently pooled over all regions and is being redesigned to be per region; do not read it as evidence for one region.
- The research pack's challenge dates (submission closed 7 Oct 2026) and the PRD's (window from 14 Nov 2026) disagree and are unverified; read the official page.
- Missing data is never drawn as zero. FIRMS gives no cloud-free denominator, so coverage is reported as unknown.
- Every result carries a release stage: `ui_prototype` (synthetic), `observed_comparison` (real data, calibration not proven) or `validated_calibration` (beats the simple ratio baselines on held-out years, with interval coverage near nominal). A transparent ratio model ships if nothing beats it.
- The quantum and LLM-guided parts are classical simulations, shown as research panels. No quantum advantage is claimed.
- No API keys or tokens belong in this repo. Zip files and `.env` files are git-ignored.

## 📊 Data and credits
Fire detections: **NASA FIRMS** (MODIS Collection 6.1, VIIRS 375 m S-NPP), 2001–2024. NASA plans to stop delivering S-NPP VIIRS science data on 2 Nov 2026; the historical years used here are unaffected. Boundaries: Natural Earth (public domain). Built by Team Lumos, Dhaka (M. Al Shahriar Hameem).
