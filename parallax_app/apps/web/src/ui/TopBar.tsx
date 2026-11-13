import type { ReactNode } from 'react';
import type { Manifest, Region } from '../types';
import { BadgeCheck, BookOpen, CircleHelp, Compass, Eye, FlaskConical, type LucideIcon } from 'lucide-react';
import { Tip } from './Tip';
import { ThemeToggle } from './ThemeToggle';
import { Logo } from './Logo';
import { Icon3D, type IconTone } from './icons/Icon3D';
import { STAGE_PLAIN } from '../shell/glossary';

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

export const STAGE_INFO: Record<string, { label: string; short: string; tone: string; text: string }> = STAGE_PLAIN;

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
  regions: Region[]; aoiId: string; /** The stage tag is about a place's estimate: shown only on the pages that show one. */ showStage?: boolean; manifest: Manifest; onAbout: () => void; onTour?: () => void; compact?: boolean; status?: ReactNode;
}

export const MANUAL_URL = `${import.meta.env.BASE_URL}Parallax-Fire-Manual.pdf`;
/** Opens the PDF manual in a new tab. Used in the top bar on every app page. */
export function ManualLink() {
  return <Tip text="Open the manual (PDF): how it works, results, sources." side="bottom"><a className="btn btn--ghost manual-link" data-manual-link href={MANUAL_URL} target="_blank" rel="noopener"><Icon3D icon={BookOpen} tone="amber" size={16} /><span>Manual</span></a></Tip>;
}

/** Brand on the left; place status tag, snapshot status, tour, theme and help on the right. Navigation lives in the shell. */
export function TopBar({ regions, aoiId, showStage = true, manifest, onAbout, onTour, compact, status }: Props) {
  const rel = regionRelease(manifest, aoiId);
  const stage = STAGE_INFO[rel.stage] ?? { label: rel.stage, short: rel.stage, tone: 'demo', text: '' };
  const regName = regions.find((r) => r.aoi_id === aoiId)?.name ?? aoiId;
  const scopeText = rel.scope === 'region' ? `Result for ${regName}.` : `${regName} is not checked on its own, so this is the result for the whole data snapshot (its weakest place).`;
  const stageTip = `${scopeText} ${stage.text}${manifest.synthetic ? ' This snapshot is demo data.' : ''}`;
  return (
    <header className="topbar">
      <a className="topbar__brand" href="#/" aria-label="Parallax Fire, home">
        <Logo size={compact ? 28 : 34} />
        <div className="topbar__name">
          <span className="topbar__title">Parallax <b>Fire</b></span>
          {!compact && <span className="topbar__tag">by Team Lumos</span>}
        </div>
      </a>
      <div className="topbar__right">
        {status}
        {showStage && <Tip text={stageTip} side="bottom" align="end">
          <button className={'stage-tag stage-tag--' + stage.tone} onClick={onAbout} aria-haspopup="dialog" aria-label={`${regName}: ${stage.label}${rel.scope === 'snapshot' ? ' (whole snapshot)' : ''}. What does this mean?`}>
            <StageTag tone={stage.tone} label={`${compact ? (rel.scope === 'region' ? regName : 'All') : (rel.scope === 'region' ? regName : 'Whole snapshot')}: ${compact ? stage.short : stage.label}`} help />
          </button>
        </Tip>}
        <ManualLink />
        {!compact && onTour && <Tip text="A one-minute guided tour of the pages." side="bottom"><button className="btn btn--ghost tour-btn-text" onClick={onTour}><Icon3D icon={Compass} tone="teal" size={16} />Take the tour</button></Tip>}
        <span className="tour-theme topbar__tools">
          <ThemeToggle />
          {onTour && <Tip text="Help: replay the guided tour." side="bottom" align="end"><button className="btn btn--ghost btn--icon help-btn" onClick={onTour} aria-label="Help: take the tour"><Icon3D icon={CircleHelp} tone="neutral" size={20} /></button></Tip>}
        </span>
      </div>
    </header>
  );
}

export function AboutData({ manifest, ageText, aoiId, regions }: { manifest: Manifest; ageText: string; aoiId?: string; regions?: Region[] }) {
  const stage = STAGE_INFO[manifest.release_stage];
  const rel = aoiId ? regionRelease(manifest, aoiId) : null;
  const relRegions = (manifest as unknown as { release_regions?: Record<string, { stage?: string }> }).release_regions ?? {};
  const nameOf = (id: string) => regions?.find((r) => r.aoi_id === id)?.name ?? id;
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
        <p className="small">Result by place: {Object.entries(relRegions).map(([k, v], i) => <span key={k}>{i ? ' · ' : ''}<b>{nameOf(k)}</b> {STAGE_INFO[v.stage ?? '']?.short ?? 'not measured'}</span>)}. The whole snapshot takes the result of its weakest place.{rel?.scope === 'snapshot' ? ' The place you picked is not checked on its own.' : ''}</p>
      )}
      <h3>Why this snapshot reads &ldquo;{stage?.label ?? 'not stated'}&rdquo;</h3>
      {parts.length ? <details className="details"><summary>Show the technical reason</summary><ul className="reason">{parts.map((p, i) => <li key={i}>{p}</li>)}</ul></details> : <p className="muted">No reason was recorded.</p>}
      <dl className="about__facts">
        <div><dt>Created (UTC)</dt><dd>{manifest.created_utc.replace('T', ' ').slice(0, 16)} · {ageText}</dd></div>
        <div><dt>Years covered</dt><dd>{manifest.years[0]}–{manifest.years[manifest.years.length - 1]}</dd></div>
        <div><dt>Data</dt><dd>{manifest.synthetic ? 'Demo data (made-up numbers in the real format)' : 'NASA FIRMS fire detections from the older satellite (MODIS) and the sharper one (VIIRS)'}</dd></div>
        <div><dt>What is counted</dt><dd>Fire detections per month. A detection is a hot pixel, not a confirmed wildfire.</dd></div>
      </dl>
      <details className="details"><summary>Technical details</summary>
        <dl className="about__facts">
          <div><dt>Snapshot id</dt><dd><code>{manifest.snapshot_id}</code></dd></div>
          <div><dt>Method behind the estimate</dt><dd><code>{manifest.selected_model_id}</code></dd></div>
        </dl>
      </details>
    </div>
  );
}
