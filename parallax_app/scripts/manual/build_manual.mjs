// Builds docs/manual/manual.html from the real snapshot, then renders apps/web/public/Parallax-Fire-Manual.pdf (A4) with headless Brave.
// Every number comes from manifest.json, metrics.json, sources.json, regions.json or src/shell/glossary.ts. Run: node scripts/manual/build_manual.mjs
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch } from '../goals/_brave.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const idx = JSON.parse(fs.readFileSync(root + 'apps/web/public/data/index.json', 'utf8'));
const snapDir = (() => { const d = fs.readdirSync(root + 'apps/web/public/data').filter((x) => x.startsWith('parallax-')); const want = idx.default_snapshot ?? idx.default ?? idx.latest; return d.includes(want) ? want : 'parallax-20261010T190934Z-ce88f489'; })();
const J = (f) => JSON.parse(fs.readFileSync(`${root}apps/web/public/data/${snapDir}/${f}`, 'utf8'));
const man = J('manifest.json'), met = J('metrics.json'), src = J('sources.json'), regs = J('regions.json');
const gloss = fs.readFileSync(root + 'apps/web/src/shell/glossary.ts', 'utf8');

// ---- helpers
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const n0 = (v) => Math.round(v).toLocaleString('en-US');
const pct = (v) => `${Math.round(v * 100)}%`;
const span = (a) => (a.length ? (a.length === 1 ? `${a[0]}` : `${a[0]}–${a[a.length - 1]}`) : '');
const name = (id) => regs.find((r) => r.aoi_id === id)?.name ?? id;
const STAGE = { validated_calibration: 'Checked on unseen years', observed_comparison: 'Raw comparison only', ui_prototype: 'Demo data' };
const stage = (s) => STAGE[s] ?? s;
const MODEL = { B0_identity: 'Copy the older satellite', B0_ratio: 'Simple ratio by month', B1_poisson: 'Statistical model', B2_xgb: 'Tree model', D1_mlp: 'Neural net' };

// glossary entries parsed from glossary.ts (label, help, tech)
const entries = [...gloss.matchAll(/^\s{2}(\w+): \{ label: '((?:[^'\\]|\\.)*)', help: '((?:[^'\\]|\\.)*)'(?:, tech: '((?:[^'\\]|\\.)*)')? \}/gm)]
  .map((m) => ({ key: m[1], label: m[2].replace(/\\'/g, "'"), help: m[3].replace(/\\'/g, "'"), tech: m[4] }));
const G = Object.fromEntries(entries.map((e) => [e.key, e]));

const split = met.split_manifest, rel = met.release;
const learn = span(split.train_years), choose = span(split.val_years), check = span(split.test_years), past = span(split.backcast_years);
const years = man.years, y0 = years[0], y1 = years[years.length - 1];
const firstViirsYear = split.backcast_years[split.backcast_years.length - 1]; // last estimated year = year VIIRS joins
const cands = met.gate.candidates;
const regionRows = Object.entries(rel.regions);
const sepRows = Object.entries(rel.reported_separately);
const created = man.created_utc.replace('T', ' ').slice(0, 16);

// sources grouped
const grp = new Map();
for (const s of src) { const k = s.sensor ?? s.kind; const e = grp.get(k) ?? { files: 0, ys: [], rows: 0, countries: new Set(), first: '9', last: '' }; e.files++; if (typeof s.year === 'number') e.ys.push(s.year); e.rows += s.rows ?? 0; if (s.country) e.countries.add(s.country.replace(/_/g, ' ')); const t = (s.retrieved_utc ?? '').slice(0, 10); if (t && t < e.first) e.first = t; if (t > e.last) e.last = t; grp.set(k, e); }
const GN = { modis: 'Older satellite (MODIS, Aqua and Terra), NASA FIRMS yearly country files', 'viirs-snpp': 'Sharper satellite (VIIRS on S-NPP), NASA FIRMS yearly country files', natural_earth: 'Country and state outlines, Natural Earth' };
const av = met.availability;

const resultRow = ([id, v]) => {
  const m = v.test_aoi_month_mae, beats = m.selected < m.B0_identity && m.selected < m.B0_month_ratio;
  return `<tr><th>${esc(name(id))}</th><td>${esc(stage(v.stage))}</td><td class="n">${n0(m.selected)}${beats ? ' (beats both)' : ''}</td><td class="n">${n0(m.B0_identity)}</td><td class="n">${n0(m.B0_month_ratio)}</td><td class="n">${pct(v.interval_test_coverage)}</td><td class="n">${v.n_test_aoi_months ?? v.interval_n_test_aoi_months}</td></tr>`;
};
const sepRow = ([id, v]) => {
  const m = v.test_aoi_month_mae;
  return `<tr><th>${esc(name(id))}</th><td>not checked on its own</td><td class="n">${n0(m.selected)}</td><td class="n">${n0(m.B0_identity)}</td><td class="n">${n0(m.B0_month_ratio)}</td><td class="n">${pct(v.interval_test_coverage)}</td><td class="n">${v.interval_n_test_aoi_months}</td></tr>`;
};
const resHead = '<thead><tr><th>Place</th><th>Result</th><th>Average miss, ours</th><th>Simple rule: copy older satellite</th><th>Simple rule: monthly ratio</th><th>Real value inside likely range</th><th>Months checked</th></tr></thead>';
const cov = regionRows[0][1];
const tol = parseFloat(/±(0\.\d+)/.exec(met.release_reason)?.[1] ?? 'NaN'), margin = parseFloat(/\(1[−-](0\.\d+)\)/.exec(met.gate.rule)?.[1] ?? 'NaN');

const CH = [
  ['What Parallax Fire is', `
<p><b>Parallax Fire</b> shows how many fire detections two NASA satellites recorded, month by month, for ${regionRows.length} checked places (${regionRows.map(([id]) => esc(name(id))).join(', ')}) and the divisions and states inside them. The data runs from ${y0} to ${y1}.</p>
<p>The two satellites do not count the same way. The older one (MODIS) sees squares about 1 km wide. The sharper one (VIIRS) sees squares about 375 m wide, so it notices smaller fires. When it joined in ${firstViirsYear}, counts leapt up even though no more land burned. Parallax Fire lines the two up on one scale so the years can be compared fairly.</p>
<h3>What it does not do</h3>
<ul><li>It does not predict future fires. It estimates what the sharper satellite would probably have counted in the past.</li><li>A detection is a hot pixel seen from space. It is not a confirmed wildfire.</li><li>Missing is never shown as zero. Estimates are always labelled and drawn dashed.</li></ul>
<p class="small">Data snapshot: <code>${esc(man.snapshot_id)}</code>, created ${created} UTC. Whole-snapshot result: <b>${esc(stage(man.release_stage))}</b>${man.synthetic ? ' (demo data)' : ''}.</p>`],
  ['Quick start', `
<table class="plain"><tbody>
<tr><th>Home</th><td>A short scroll story of the idea. Pick a place and go.</td></tr>
<tr><th>Story</th><td>One real month, March ${years.includes(2024) ? 2024 : y1} in Bangladesh, in a few steps with its real numbers.</td></tr>
<tr><th>Calendar</th><td>Pick a place. Each square is one month. Click a square to see its summary.</td></tr>
<tr><th>Map</th><td>Where inside the place the satellites saw fire in the month you picked.</td></tr>
<tr><th>Two satellites</th><td>The older and the sharper satellite on one chart, with the ${firstViirsYear} jump shown raw and on one scale.</td></tr>
<tr><th>Live</th><td>The Earth with today's satellite fire detections and where the satellites are now.</td></tr>
<tr><th>Results</th><td>How well the estimate held up on unseen years, place by place.</td></tr>
<tr><th>Data</th><td>Where every number comes from, downloads (CSV, printable brief), snapshot facts.</td></tr>
</tbody></table>
<p>The place, year and month you pick are shared across pages and kept in the address, so a link opens the same view.</p>`],
  ['Reading the calendar', `
<p>Rows are years, columns are months. Colour shows the count of fire detections: darker means more. Each colour is paired with a symbol so the calendar also reads without colour.</p>
<table class="plain"><tbody>
<tr><th>${esc(G.hotspot.label)}</th><td>${esc(G.hotspot.help)}</td></tr>
<tr><th>Estimate (dashed)</th><td>${esc(G.estimate.help)}</td></tr>
<tr><th>${esc(G.noData.label)}</th><td>${esc(G.noData.help)} Hatched squares mean no data.</td></tr>
<tr><th>${esc(G.partial.label)}</th><td>${esc(G.partial.help)}</td></tr>
<tr><th>${esc(G.unusual.label)}</th><td>${esc(G.unusual.help)}</td></tr>
</tbody></table>
<h3>Partial months in this snapshot</h3>
<table><thead><tr><th>Country</th><th>Aqua partial month</th><th>S-NPP partial month</th></tr></thead><tbody>${Object.entries(av).map(([c, v]) => `<tr><th>${esc(c.replace(/_/g, ' '))}</th><td>${esc((v.aqua.partial_months || []).join(', ') || 'none')}</td><td>${esc((v.snpp.partial_months || []).join(', ') || 'none')}</td></tr>`).join('')}</tbody></table>
<p class="small">Partial months show their observed counts but are left out of learning, the simple rules and the unusual-month flags.</p>`],
  ['Two satellites and the jump', `
<p>${esc(G.modis.help)} ${esc(G.viirs.help)}</p>
<p>Gluing the two records together makes the line leap upward in ${firstViirsYear}. The "Two satellites" page shows that jump twice: raw, and on one scale (the estimate).</p>
<p>The chart has a switch between <b>squeezed</b> and <b>even</b> scale. Squeezed gives every tripling the same height, so quiet and huge months can be read together, and zero stays at the bottom. Even gives equal steps equal counts, which is honest about size but makes quiet months look tiny.</p>
<h3>The lines</h3>
<ul><li><b>Older satellite:</b> what MODIS counted. Terra and Aqua are shown separately; Terra is never mixed into the estimate.</li><li><b>Sharper satellite:</b> what VIIRS counted, since ${firstViirsYear}.</li><li><b>Estimate (dashed):</b> what the sharper satellite would probably have counted, with a shaded likely range.</li><li><b>Fixed heat sources:</b> industry, kilns and similar, counted separately.</li></ul>`],
  ['How the estimate is made', `
<ol class="steps">
<li><b>Count the hot pixels.</b> For each place and month we count the fire detections of each satellite.</li>
<li><b>Notice the jump.</b> The sharper satellite sees smaller fires, so counts leap when it joins.</li>
<li><b>Learn the translation.</b> In ${learn} both satellites were flying. We study how many detections the sharper one made whenever the older one saw a given number. These are the <i>years used to learn</i> (${split.rows.train.toLocaleString('en-US')} cell-months).</li>
<li><b>Try several methods and pick one.</b> Each was compared on ${choose}, years held back for choosing (${split.rows.val.toLocaleString('en-US')} cell-months). The winner is the <b>${esc(MODEL[man.selected_model_id] ?? man.selected_model_id)}</b>.</li>
<li><b>Check it on unseen years.</b> ${check} were kept sealed until the end and used once (${split.rows.test.toLocaleString('en-US')} cell-months). The results in chapter 6 come from those years only.</li>
<li><b>Add a likely range.</b> Next to every estimate we show a likely range (8 in 10). Chapter 6 measures how often the real value landed inside it.</li>
<li><b>Fill in the past.</b> For ${past}, when only the older satellite existed, we show the estimated past, always dashed and labelled.</li>
</ol>
<h3>The methods compared</h3>
<p>Error is the average miss of the monthly total over the whole pool of checked places, on the years used to choose (lower is better). A method only counts if it beats the simple rules by at least ${pct(margin)} (the gate rule).</p>
<table><thead><tr><th>Method</th><th>Average miss</th><th>Passes the bar?</th></tr></thead><tbody>${Object.entries(cands).map(([k, v]) => `<tr><th>${esc(MODEL[k] ?? k)}</th><td class="n">${n0(v.val_aoi_month_mae)}</td><td>${v.passes ? 'yes' : 'no'}</td></tr>`).join('')}</tbody></table>
<p class="small">The chosen method is the passing one with the lowest miss: <b>${esc(MODEL[met.selected_model_id] ?? met.selected_model_id)}</b> (technical id <code>${esc(met.selected_model_id)}</code>).</p>
<h3>Years at a glance</h3>
<table class="plain"><tbody><tr><th>${esc(G.past.label)}</th><td>${past}</td></tr><tr><th>${esc(G.learn.label)}</th><td>${learn}</td></tr><tr><th>${esc(G.choose.label)}</th><td>${choose}</td></tr><tr><th>${esc(G.check.label)}</th><td>${check}</td></tr></tbody></table>`],
  ['Results by place', `
<p>Every row is measured on the unseen check years (${check}). "Average miss" is how far off the monthly total was, on average, in fire detections; lower is better. A place is labelled <b>${esc(STAGE.validated_calibration)}</b> only if the estimate beat both simple rules and its likely range was within ${pct(tol)} points of the ${pct(cov.interval_nominal)} aim (each place has ${cov.n_test_aoi_months} checked months, so the coverage is uncertain by about ${pct(cov.coverage_standard_error_approx)}).</p>
<h3>Places checked on their own</h3>
<table>${resHead}<tbody>${regionRows.map(resultRow).join('')}</tbody></table>
<p>The whole snapshot is labelled <b>${esc(stage(man.release_stage))}</b> because it takes the result of its weakest checked place${regionRows.some(([, v]) => v.stage !== 'validated_calibration') ? ': ' + regionRows.filter(([, v]) => v.stage !== 'validated_calibration').map(([id, v]) => `${esc(name(id))} (${esc((v.reasons_not_validated || []).join('; '))})`).join(', ') : ''}.</p>
<h3>Reported separately (for information; they do not decide the label)</h3>
<p class="small">These sit inside a larger checked place, or are whole countries dominated by huge counts.</p>
<table>${resHead}<tbody>${sepRows.map(sepRow).join('')}</tbody></table>
<p class="small">Source: <code>metrics.json</code> in snapshot <code>${esc(man.snapshot_id)}</code>, fields <code>release.regions</code> and <code>release.reported_separately</code>.</p>`],
  ['Live data and the Earth view', `
<p>The Live page uses real, current feeds only. Each layer shows its source, a time and an honest state: loading, none in the area, or feed unavailable.</p>
<table class="plain"><tbody>
<tr><th>Fire detections, last 24 hours</th><td>NASA FIRMS near-real-time files for MODIS, NOAA-20 VIIRS and NOAA-21 VIIRS, worldwide. Fetched through a server function and cached about 15 to 30 minutes.</td></tr>
<tr><th>Satellite imagery</th><td>NASA GIBS true-colour images of the day before, and night lights.</td></tr>
<tr><th>Satellites now</th><td>Terra, Aqua, Suomi NPP, NOAA-20 and NOAA-21, calculated in your browser from public orbit elements (CelesTrak), refreshed no more often than every 2 hours.</td></tr>
<tr><th>Basemap</th><td>OpenFreeMap (OpenStreetMap data). If it cannot load, a plain outline map is used and the page says so.</td></tr>
</tbody></table>
<h3>What "near-real-time" means</h3>
<p>These detections arrive within a few hours of the overpass and are not final. They are not part of the monthly calendar, which uses the yearly FIRMS country files.</p>
<h3>Suomi NPP feed</h3>
<p>At the time of checking, NASA's Suomi NPP near-real-time file contained only its header and no detections. The page then says "none reported" for that satellite. It never shows an empty feed as zero fires.</p>
<p>Ground cameras are not embedded because their licences do not allow it. The satellite imagery is the "camera", and is labelled as imagery.</p>`],
  ['Data, sources and licences', `
<table><thead><tr><th>Source</th><th>Files</th><th>Years</th><th>Fetched</th></tr></thead><tbody>${[...grp.entries()].map(([k, e]) => `<tr><th>${esc(GN[k] ?? k)}${e.countries.size ? `<br><span class="small">${[...e.countries].map(esc).join(', ')}</span>` : ''}</th><td class="n">${e.files}</td><td>${e.ys.length ? span([Math.min(...e.ys), Math.max(...e.ys)]) : 'n/a'}</td><td>${e.first === e.last ? e.first : `${e.first} to ${e.last}`}</td></tr>`).join('')}</tbody></table>
<h3>Licences and credits</h3>
<ul>
<li><b>Fire detections:</b> NASA FIRMS (firms.modaps.eosdis.nasa.gov). We acknowledge the use of data and imagery from LANCE FIRMS operated by NASA's Earth Science Data and Information System (ESDIS).</li>
<li><b>Satellite imagery:</b> NASA EOSDIS GIBS / Worldview.</li>
<li><b>Satellite orbits:</b> CelesTrak (celestrak.org).</li>
<li><b>Basemap:</b> OpenFreeMap, OpenMapTiles, data from OpenStreetMap contributors.</li>
<li><b>Country and state outlines:</b> Natural Earth, public domain.</li>
<li><b>Bangladesh districts:</b> geoBoundaries (gbOpen, CC BY 3.0 IGO), source BBS / OCHA ROAP.</li>
</ul>
<p>FIRMS acknowledgement: "We acknowledge the use of data and/or imagery from NASA's Fire Information for Resource Management System (FIRMS) (https://earthdata.nasa.gov/firms), part of NASA's Earth Observing System Data and Information System (EOSDIS)."</p>
<h3>Downloads</h3>
<p>The Data page downloads every month of the place and years you picked as a spreadsheet (CSV) and opens a one-page printable brief. Estimates stay labelled and missing months stay missing.</p>`],
  ['Limits and honest use', `
<ul>
<li>It does not say what will happen next. It lines up counts from the past and the present.</li>
<li>A detection is a hot pixel seen from space. It is not a confirmed wildfire and gives neither size nor damage.</li>
<li>Clouds and smoke can hide fires. FIRMS gives no count of cloud-free looks, so we cannot say how many fires were hidden.</li>
<li>The estimate cannot recover small fires the older satellite never saw. It tells you what the sharper satellite would typically have counted, with a range.</li>
<li>Results hold per place. A good result for one place says nothing about another.</li>
<li>With ${cov.n_test_aoi_months} checked months per place, the results are coarse evidence (uncertain by about ${pct(cov.coverage_standard_error_approx)} on coverage).</li>
<li>Fixed heat sources such as industry are counted separately. Crop and prescribed burning cannot be told apart from other vegetation fires and are included.</li>
<li>Months with no satellite record in this snapshot (Aqua / Terra / S-NPP): ${Object.entries(av).map(([c, v]) => `${esc(c.replace(/_/g, ' '))} ${v.aqua.missing_months} / ${v.terra.missing_months} / ${v.snpp.missing_months}`).join('; ')}. The S-NPP figure includes every month before it flew.</li>
<li>${man.synthetic ? 'This snapshot is demo data.' : 'This snapshot is real data, not demo data.'}</li>
</ul>`],
  ['Glossary', `<table class="plain"><thead><tr><th>Plain word</th><th>Meaning</th><th>Technical term</th></tr></thead><tbody>${entries.filter((e) => e.key !== 'demo' || true).map((e) => `<tr><th>${esc(e.label)}</th><td>${esc(e.help)}</td><td>${esc(e.tech ?? '')}</td></tr>`).join('')}${Object.entries(MODEL).filter(([k]) => k !== 'B0_ratio').map(([k, v]) => `<tr><th>${esc(v)}</th><td>One of the methods tried (chapter 5).</td><td>${esc(k)}</td></tr>`).join('')}</tbody></table>`],
  ['Credits', `
<p><b>Parallax Fire</b> by <b>Team Lumos</b>, created by <b>M Al Shahriar Hameem</b>.</p>
<p>Built for the <b>NASA Space Apps Challenge 2026</b>, challenge: <i>Harmonization of MODIS and VIIRS Hot Spots</i>.</p>
<p>The team page, with the team members, is at spaceappschallenge.org/2026/find-a-team/lumos2/.</p>
<p>Data courtesy of NASA FIRMS, NASA GIBS, CelesTrak, OpenFreeMap and OpenStreetMap contributors, Natural Earth and geoBoundaries (chapter 8).</p>
<p class="small">Manual generated from snapshot <code>${esc(man.snapshot_id)}</code> on the numbers in its files; re-run <code>node scripts/manual/build_manual.mjs</code> to rebuild.</p>`]
];

const css = `
@page { size: A4; margin: 20mm 18mm 22mm 18mm; }
:root { --ink:#1b1f24; --mut:#5a6470; --line:#d5dae0; --acc:#c2410c; --bg:#fff; }
* { box-sizing: border-box; }
body { font: 11pt/1.5 -apple-system, "Helvetica Neue", Arial, sans-serif; color: var(--ink); background: var(--bg); margin: 0; }
h1 { font-size: 22pt; margin: 0 0 6mm; color: var(--acc); break-after: avoid; }
h2 { font-size: 14pt; } h3 { font-size: 12pt; margin: 6mm 0 2mm; break-after: avoid; }
.chapter { break-before: page; } .cover, .toc { break-after: page; }
.cover { padding-top: 70mm; } .cover h1 { font-size: 40pt; margin-bottom: 4mm; }
.cover .sub { font-size: 15pt; color: var(--mut); margin: 0 0 14mm; } .cover p { margin: 1.5mm 0; }
.toc ol { list-style: none; padding: 0; } .toc li { display: flex; gap: 4mm; padding: 1.6mm 0; border-bottom: 1px dotted var(--line); } .toc li span.t { flex: 1; } .toc li span.p { color: var(--mut); }
p, li { margin: 0 0 3mm; } ul, ol { padding-left: 6mm; }
.small { font-size: 9.5pt; color: var(--mut); } code { font: 9pt ui-monospace, Menlo, monospace; background: #f1f3f5; padding: 0 1mm; overflow-wrap: anywhere; }
table { width: 100%; border-collapse: collapse; margin: 3mm 0 5mm; font-size: 9.5pt; } tr { break-inside: avoid; }
th, td { border: 1px solid var(--line); padding: 1.6mm 2.2mm; vertical-align: top; text-align: left; } thead th { background: #f1f3f5; }
td.n { text-align: right; font-variant-numeric: tabular-nums; } table.plain th { width: 32%; background: #f7f8f9; font-weight: 600; }
ol.steps li { margin-bottom: 3.5mm; }
`;
const build = (tocPages) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Parallax Fire manual</title><style>${css}</style></head><body>
<section class="cover"><h1>Parallax Fire</h1><p class="sub">Manual</p><p><b>Team Lumos</b>, created by M Al Shahriar Hameem</p><p>NASA Space Apps Challenge 2026: Harmonization of MODIS and VIIRS Hot Spots</p><p class="small">Data snapshot ${esc(man.snapshot_id)}, created ${created} UTC</p></section>
<section class="toc"><h1>Contents</h1><ol>${CH.map(([t], i) => `<li><span class="t">${i + 1}. ${esc(t)}</span><span class="p">${tocPages?.[i] ?? ''}</span></li>`).join('')}</ol></section>
${CH.map(([t, body], i) => `<section class="chapter"><h1>${i + 1}. ${esc(t)}</h1>${body}</section>`).join('\n')}
</body></html>`;

const htmlPath = root + 'docs/manual/manual.html', pdfPath = root + 'apps/web/public/Parallax-Fire-Manual.pdf';
const b = await launch();
const page = await b.newPage();
const render = async (html) => {
  fs.writeFileSync(htmlPath, html);
  await page.goto('file://' + htmlPath, { waitUntil: 'load' });
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, displayHeaderFooter: true, margin: { top: '20mm', bottom: '22mm', left: '18mm', right: '18mm' },
    headerTemplate: '<span></span>', footerTemplate: '<div style="width:100%;font:8pt Arial;color:#5a6470;padding:0 18mm;display:flex;justify-content:space-between"><span>Parallax Fire manual</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>' });
};
await render(build(null));
const pages = (() => { const py = `import sys,json\nfrom pypdf import PdfReader\nr=PdfReader(sys.argv[1]);heads=json.loads(sys.argv[2]);out=[]\nfor h in heads:\n  p=''\n  for i,pg in enumerate(r.pages):\n    if i<2: continue\n    if h in (pg.extract_text() or ''): p=i+1;break\n  out.append(p)\nprint(json.dumps({'pages':out,'n':len(r.pages)}))`; return JSON.parse(execFileSync('python3', ['-c', py, pdfPath, JSON.stringify(CH.map(([t], i) => `${i + 1}. ${t}`))]).toString()); })();
await render(build(pages.pages));
await b.close();
console.log(JSON.stringify({ html: htmlPath, pdf: pdfPath, bytes: fs.statSync(pdfPath).size, pages: pages.n, toc: pages.pages }));
