# Parallax Fire documentation

Start with the [main README](../README.md). This page lists all the other documents and what each is for.

## For users
| Document | What it covers |
|---|---|
| [User and method manual (PDF)](https://parallaxfire.netlify.app/Parallax-Fire-Manual.pdf) | Every page of the app, the method, the results per place, sources, licences, limits and a glossary. Built from the real data by [`build_manual.mjs`](../parallax_app/scripts/manual/build_manual.mjs). |
| [Live app](https://parallaxfire.netlify.app) | The app itself. A short guided tour starts on first visit (Help to replay it). |
| [30-second demo](https://youtu.be/Y13heGQp3xo) · [240-second pitch](https://youtu.be/YClSb3WXftQ) | The two videos. Scripts, timings and sources: [`video/SCRIPT_240s.md`](../video/SCRIPT_240s.md). |

## For developers
| Document | What it covers |
|---|---|
| [Developer guide](../parallax_app/README.md) | Stack, how to run, test, build and deploy, data snapshot import, live-data functions, scripts. |
| [Data contract](../parallax_app/CONTRACT.md) | The snapshot bundle format the notebooks write and the app reads. |
| [Product requirements](../parallax_app/PRD.md) | The product requirements the app was built against. |
| [Status notes (12 Nov 2026)](../parallax_app/STATUS.md) | What was built and checked at that point, and what was not. |
| [Live sources](../parallax_app/docs/LIVE_SOURCES.md) | Every live feed (NASA FIRMS, NASA GIBS, CelesTrak, OpenFreeMap) with its endpoint, caching and checks. |
| [Source check](../parallax_app/docs/SOURCE_CHECK.md) | Audit of every data source and claim used in the app. |
| [UI design brief](../parallax_app/docs/UI_DESIGN_BRIEF.md) | Colours, type, motion, icons and accessibility rules. |
| Feature specs | [Revamp](../parallax_app/docs/REVAMP_SPEC.md) (pages and navigation), [Improve](../parallax_app/docs/IMPROVE_SPEC.md) (the one-scale switch and the March 2024 story), [Earth](../parallax_app/docs/EARTH_SPEC.md) (the 3D Live Earth), [Plain](../parallax_app/docs/PLAIN_SPEC.md) (plain pages and the PDF manual). |

## For reproducing the data
| Document | What it covers |
|---|---|
| [Kaggle step-by-step guide](../kaggle_notebooks/STEP_INDEX.md) | Every cell of Notebook A (download and verify NASA FIRMS archives) and Notebook B (train, test and export), with checks. |
| [Notebook A](../kaggle_notebooks/parallax_A_fetch.ipynb) · [Notebook B](../kaggle_notebooks/parallax_B_train.ipynb) | The notebooks, as run on Kaggle. |
| [Runbook](../parallax_app/docs/RUNBOOK.md) | The original end-to-end runbook (October 2026). |
| [Kaggle environment notes](../parallax_app/docs/kaggle/KAGGLE_ENV.md) | GPU options and limits found on Kaggle. |

## Media and history
| Folder | What it holds |
|---|---|
| [`media/`](media/) | README GIFs and the team image. GIFs are made by [`make_gifs.mjs`](../parallax_app/scripts/readme/make_gifs.mjs). |
| [`screenshots/`](screenshots/) | Laptop and phone screenshots of every page of the live site. |
| [`../branding/`](../branding/) | Parallax Fire and Team Lumos logos (SVG and PNG). |
| [`../video/`](../video/) | Video scripts and subtitles; the builder is [`make_video.mjs`](../parallax_app/scripts/video/make_video.mjs). |
| [`archive/`](archive/) | Build notes, agent prompts and the original challenge and PRD documents (October 2026). |

## Licences
Code: [MIT](../LICENSE) · Docs and media: [CC BY 4.0](../LICENSE-CONTENT.md) · Data and libraries: [third-party notices](../THIRD_PARTY_NOTICES.md)
