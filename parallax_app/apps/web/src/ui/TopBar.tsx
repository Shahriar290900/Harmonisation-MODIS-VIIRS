import type { ReactNode } from 'react';
import type { Manifest, Region } from '../types';
import { BadgeCheck, BarChart3, CircleHelp, Compass, Eye, FlaskConical, type LucideIcon } from 'lucide-react';
import { Tip } from './Tip';
import { ThemeToggle } from './ThemeToggle';
import { Logo } from './Logo';
import { Icon3D, type IconTone } from './icons/Icon3D';

const STAGE_ICON: Record<string, { icon: LucideIcon; tone: IconTone }> = {
  demo: { icon: FlaskConical, tone: 'red' },
  obs: { icon: Eye, tone: 'cyan' },
  val: { icon: BadgeCheck, tone: 'teal' }
};

/** Rectangular release-stage tag: left accent bar + icon + uppercase label. */
export function StageTag({ tone, label, help }: { tone: string; label: string; help?: boolean }) {
  const ic = STAGE_ICON[tone] ?? STAGE_ICON.demo;
  return <><Icon3D icon={ic.icon} tone={ic.tone} size={15} /><span className="stage-tag__lab">{label}</span>{help && <Icon3D icon={CircleHelp} tone="neutral" size={14} className="stage-tag__q" />}</>;
}

export const STAGE_INFO: Record<string, { label: string; short: string; tone: string; text: string }> = {
  ui_prototype: { label: 'UI prototype', short: 'Prototype', tone: 'demo', text: 'Synthetic fixture data in the real format. Numbers are plumbing checks, not results.' },
  observed_comparison: { label: 'Observed comparison', short: 'Observed', tone: 'obs', text: 'Real FIRMS data. The harmonization has not yet passed every release check, so treat estimates as a comparison, not a calibrated product.' },
  validated_calibration: { label: 'Validated calibration', short: 'Validated', tone: 'val', text: 'The selected model beat both simple baselines on the held-out test years and its 80% interval coverage is within ±10 points of nominal.' }
};

export interface RegionRelease { stage: string; scope: 'region' | 'snapshot'; reasons: string[]; n?: number; coverage?: number | null }

/**
 * Per-region release stage. The snapshot manifest carries `release_regions[aoi_id].stage` for the gated regions only
 * (BGD, AUS-NSW, USA-CA in the current snapshot). Read defensively (the zod schema does not declare the field; manifest is passthrough).
 * Regions that are not gated (BGD divisions, whole-country AUS/USA) fall back to the overall stage, labelled as such.
 */
export function regionRelease(manifest: Manifest, aoiId: string): RegionRelease {
  const rr = (manifest as unknown as { release_regions?: Record<string, { stage?: string; reasons_not_validated?: string[]; n_test_aoi_months?: number; interval_test_coverage?: number | null }> }).release_regions;
  const g = rr?.[aoiId];
  if (g && typeof g.stage === 'string' && STAGE_INFO[g.stage]) return { stage: g.stage, scope: 'region', reasons: g.reasons_not_validated ?? [], n: g.n_test_aoi_months, coverage: g.interval_test_coverage };
  return { stage: manifest.release_stage, scope: 'snapshot', reasons: [] };
}

interface Props {
  regions: Region[]; aoiId: string; onAoi: (id: string) => void;
  years: number[]; from: number; to: number; onRange: (from: number, to: number) => void;
  manifest: Manifest; onAbout: () => void; onModels: () => void; onExplain: () => void; onTour?: () => void; compact?: boolean; status?: ReactNode;
}

export function TopBar({ regions, aoiId, onAoi, years, from, to, onRange, manifest, onAbout, onModels, onExplain, onTour, compact, status }: Props) {
  const groups = [...new Set(regions.map((r) => r.country))];
  const rel = regionRelease(manifest, aoiId);
  const stage = STAGE_INFO[rel.stage] ?? { label: rel.stage, short: rel.stage, tone: 'demo', text: '' };
  const regName = regions.find((r) => r.aoi_id === aoiId)?.name ?? aoiId;
  const scopeText = rel.scope === 'region' ? `Stage for ${regName}.` : `${regName} is not gated on its own, so this is the whole snapshot's stage (its weakest region).`;
  const stageTip = `${scopeText} ${stage.text}${manifest.synthetic ? ' This snapshot is synthetic demo data.' : ''}`;
  return (
    <header className="topbar">
      <div className="topbar__brand">
        <Logo size={compact ? 28 : 34} />
        <div className="topbar__name">
          <span className="topbar__title">Parallax {compact && <br />}<b>Fire</b></span>
          {!compact && <span className="topbar__tag">Harmonized MODIS + VIIRS hotspots · one fair scale</span>}
        </div>
      </div>
      <div className="topbar__controls">
        <label className="field tour-area">
          <span className="field__lab">Area</span>
          <select value={aoiId} onChange={(e) => onAoi(e.target.value)} aria-label="Area of interest">
            {groups.map((g) => (
              <optgroup key={g} label={g}>
                {regions.filter((r) => r.country === g).map((r) => <option key={r.aoi_id} value={r.aoi_id}>{r.kind === 'admin1' ? ' ' : ''}{r.name}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        <div className="field field--range">
          <span className="field__lab">Years</span>
          <select aria-label="From year" value={from} onChange={(e) => onRange(Math.min(+e.target.value, to), to)}>{years.map((y) => <option key={y}>{y}</option>)}</select>
          <span className="muted" aria-hidden>–</span>
          <select aria-label="To year" value={to} onChange={(e) => onRange(from, Math.max(+e.target.value, from))}>{years.map((y) => <option key={y}>{y}</option>)}</select>
        </div>
      </div>
      <div className="topbar__right">
        {status}
        <Tip text={stageTip} side="bottom" align="end">
          <button className={'stage-tag stage-tag--' + stage.tone} onClick={onAbout} aria-haspopup="dialog" aria-label={`Release stage for ${regName}: ${stage.label}${rel.scope === 'snapshot' ? ' (whole snapshot)' : ''}. Why?`}>
            <StageTag tone={stage.tone} label={compact ? stage.short : stage.label} help />
          </button>
        </Tip>
        {!compact && onTour && <Tip text="A one-minute guided tour of the calendar, map, chart and evidence." side="bottom"><button className="btn btn--ghost tour-btn-text" onClick={onTour}><Icon3D icon={Compass} tone="teal" size={16} />Take the tour</button></Tip>}
        <Tip text="Learn how MODIS and VIIRS are put on one scale." side="bottom"><button className={'btn btn--ghost' + (compact ? ' btn--icon' : '')} onClick={onExplain} aria-haspopup="dialog" aria-label={compact ? 'What is harmonization?' : undefined}><Icon3D icon={CircleHelp} tone="amber" size={compact ? 20 : 16} />{!compact && 'What is harmonization?'}</button></Tip>
        <Tip text="How well each model did on years it never saw. Estimates are never presented as measurements." side="bottom"><button className="btn btn--ghost" onClick={onModels} aria-haspopup="dialog"><Icon3D icon={BarChart3} tone="violet" size={16} />Models</button></Tip>
        <span className="tour-theme topbar__tools">
          <ThemeToggle />
          {onTour && <Tip text="Help: replay the guided tour." side="bottom" align="end"><button className="btn btn--ghost btn--icon help-btn" onClick={onTour} aria-label="Help: take the tour"><Icon3D icon={CircleHelp} tone="neutral" size={20} /></button></Tip>}
        </span>
      </div>
    </header>
  );
}

export function AboutData({ manifest, ageText, aoiId }: { manifest: Manifest; ageText: string; aoiId?: string }) {
  const stage = STAGE_INFO[manifest.release_stage];
  const rel = aoiId ? regionRelease(manifest, aoiId) : null;
  const relRegions = (manifest as unknown as { release_regions?: Record<string, { stage?: string }> }).release_regions ?? {};
  const parts = (manifest.release_reason ?? '').split(/\s*\|\s*/).filter(Boolean);
  return (
    <div className="about">
      <div className="stages">
        {Object.entries(STAGE_INFO).map(([k, s]) => (
          <div key={k} className={'stage' + (k === manifest.release_stage ? ' is-cur' : '')}>
            <span className={'stage-tag stage-tag--static stage-tag--' + s.tone}><StageTag tone={s.tone} label={s.label} /></span>
            <p className="small">{s.text}</p>
          </div>
        ))}
      </div>
      {Object.keys(relRegions).length > 0 && (
        <p className="small">Stage by region: {Object.entries(relRegions).map(([k, v], i) => <span key={k}>{i ? ' · ' : ''}<b>{k}</b> {STAGE_INFO[v.stage ?? '']?.short ?? v.stage}</span>)}. The whole-snapshot stage is the weakest region.{rel?.scope === 'snapshot' ? ' The selected area is not gated on its own.' : ''}</p>
      )}
      <h3>Why this snapshot is “{stage?.label ?? manifest.release_stage}”</h3>
      {parts.length ? <ul className="reason">{parts.map((p, i) => <li key={i}>{p}</li>)}</ul> : <p className="muted">No release reason recorded.</p>}
      <dl className="about__facts">
        <div><dt>Snapshot</dt><dd><code>{manifest.snapshot_id}</code></dd></div>
        <div><dt>Created (UTC)</dt><dd>{manifest.created_utc.replace('T', ' ').slice(0, 16)} · {ageText}</dd></div>
        <div><dt>App estimate model</dt><dd>{manifest.selected_model_id}</dd></div>
        <div><dt>Years</dt><dd>{manifest.years[0]}–{manifest.years[manifest.years.length - 1]}</dd></div>
        <div><dt>Data</dt><dd>{manifest.synthetic ? 'SYNTHETIC fixture (demo)' : 'NASA FIRMS MODIS C6.1 + VIIRS 375 m S-NPP country CSVs'}</dd></div>
        <div><dt>Units</dt><dd>Type-0 active-fire detections per UTC month. A hotspot is a hot pixel, not a fire incident.</dd></div>
      </dl>
    </div>
  );
}
