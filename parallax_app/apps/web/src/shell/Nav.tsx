import { useEffect, useState } from 'react';
import { BookOpen, CalendarDays, Database, House, Map as MapIcon, MoreHorizontal, Radio, Satellite, type LucideIcon } from 'lucide-react';
import { routeHash, type Route } from '../state/store';
import { useSelection } from '../ui/bridge';

interface Item { route: Route; label: string; icon: LucideIcon }
const ITEMS: Item[] = [
  { route: 'home', label: 'Home', icon: House },
  { route: 'calendar', label: 'Calendar', icon: CalendarDays },
  { route: 'map', label: 'Map', icon: MapIcon },
  { route: 'sensors', label: 'Two satellites', icon: Satellite },
  { route: 'live', label: 'Live', icon: Radio },
  { route: 'method', label: 'How it works', icon: BookOpen },
  { route: 'data', label: 'Data & sources', icon: Database }
];

/**
 * The one navigation element: a left rail on desktop, a bottom bar with a "More" sheet on phones (CSS decides).
 * Real links (href hashes) that carry the shared selection, so changing page keeps the place, year and month.
 */
export function Nav({ route, liveAvailable }: { route: Route; liveAvailable: boolean }) {
  const sel = useSelection();
  const [more, setMore] = useState(false);
  useEffect(() => setMore(false), [route]);
  useEffect(() => {
    if (!more) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setMore(false); };
    document.addEventListener('keydown', key); return () => document.removeEventListener('keydown', key);
  }, [more]);
  const items = ITEMS.filter((i) => i.route !== 'live' || liveAvailable);
  // Phone bottom bar: four pages + "More". Live takes the fourth slot once it exists, which moves How it works under More.
  const onBar: Route[] = liveAvailable ? ['calendar', 'map', 'sensors', 'live'] : ['calendar', 'map', 'sensors', 'method'];
  const moreActive = !onBar.includes(route);
  let extra = 0;
  return (
    <nav className="nav" data-nav aria-label="Pages" data-more={more ? 'open' : 'closed'}>
      {more && <button type="button" className="nav__scrim" aria-label="Close menu" onClick={() => setMore(false)} />}
      <ul className="nav__list">
        {items.map((i) => {
          const Icon = i.icon;
          const phone = onBar.includes(i.route);
          const style = phone ? undefined : ({ '--i': extra++ } as React.CSSProperties);
          return (
            <li key={i.route} className={'nav__item' + (phone ? '' : ' nav__item--extra')} style={style}>
              <a href={routeHash(i.route, sel)} data-route={i.route} aria-current={route === i.route ? 'page' : undefined} className={route === i.route ? 'is-on' : ''}>
                <Icon size={20} aria-hidden /><span>{i.label}</span>
              </a>
            </li>
          );
        })}
        <li className="nav__item nav__more">
          <button type="button" className={moreActive ? 'is-on' : ''} aria-expanded={more} aria-haspopup="true" onClick={() => setMore(!more)}><MoreHorizontal size={20} aria-hidden /><span>More</span></button>
        </li>
      </ul>
    </nav>
  );
}
