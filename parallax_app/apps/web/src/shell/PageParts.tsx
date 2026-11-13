import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import type { Route } from '../state/store';
import { routeHash } from '../state/store';
import { useSelection } from '../ui/bridge';

/** <main> wrapper: one per page, focusable for the skip link, natural page scroll. */
export function Page({ route, children, className }: { route: Route; children: ReactNode; className?: string }) {
  return <main id="main" tabIndex={-1} data-page={route} className={'page' + (className ? ' ' + className : '')}>{children}</main>;
}

/** The page's one <h1>, a one-sentence plain description and an optional controls row. */
export function PageHead({ title, lead, children }: { title: string; lead: string; children?: ReactNode }) {
  return (
    <header className="page__head">
      <h1>{title}</h1>
      <p className="page__lead">{lead}</p>
      {children && <div className="page__tools">{children}</div>}
    </header>
  );
}

export const PAGE_LABEL: Partial<Record<Route, { label: string; why: string }>> = {
  calendar: { label: 'Burning calendar', why: 'See every month of the place at a glance.' },
  map: { label: 'Map', why: 'See where in the place it burned.' },
  sensors: { label: 'Two satellites', why: 'See why the two satellites disagree and how we line them up.' },
  method: { label: 'Results', why: 'How well the estimate held up.' },
  data: { label: 'Data & sources', why: 'See where every number comes from and download it.' },
  live: { label: 'Live', why: 'See today’s fire detections.' }
};

/** "Next step" buttons at the bottom of every page. They keep the selected place, year and month. */
export function NextSteps({ to }: { to: Route[] }) {
  const sel = useSelection();
  return (
    <nav className="nextsteps" aria-label="Next steps">
      <h2>What next?</h2>
      <ul>
        {to.map((r) => {
          const p = PAGE_LABEL[r]; if (!p) return null;
          return (
            <li key={r}>
              <a className="btn nextsteps__btn" href={routeHash(r, sel)}><span><b>{p.label}</b><small>{p.why}</small></span><ArrowRight size={16} aria-hidden /></a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
