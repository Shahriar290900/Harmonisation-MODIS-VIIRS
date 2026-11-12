import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, MapPin, Search } from 'lucide-react';
import type { Region } from '../types';
import { displayKind } from '../data/regions';
import { setSelection } from '../ui/bridge';

/** Search box + list grouped by country, then division or state. Replaces the cramped <select>. */
export function PlacePicker({ regions, aoiId, allowed }: { regions: Region[]; aoiId: string; allowed?: string[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const cur = regions.find((r) => r.aoi_id === aoiId);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const down = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); box.current?.querySelector<HTMLButtonElement>('.pp__btn')?.focus(); } };
    document.addEventListener('pointerdown', down); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('keydown', key); };
  }, [open]);

  const groups = useMemo(() => {
    const ok = regions.filter((r) => !allowed || allowed.length === 0 || allowed.includes(r.aoi_id));
    const needle = q.trim().toLowerCase();
    const hit = (r: Region) => !needle || r.name.toLowerCase().includes(needle) || r.country.toLowerCase().includes(needle);
    return [...new Set(ok.map((r) => r.country))].map((country) => {
      const all = ok.filter((r) => r.country === country);
      const top = all.filter((r) => r.kind === 'country');
      const sub = all.filter((r) => r.kind !== 'country');
      // a country matches by name (then show everything under it) or by one of its divisions/states
      const countryHit = !needle || country.toLowerCase().includes(needle);
      return { country, top: top.filter((r) => countryHit || hit(r)), sub: sub.filter((r) => countryHit || hit(r)) };
    }).filter((g) => g.top.length + g.sub.length > 0);
  }, [regions, allowed, q]);

  const pick = (r: Region) => { setSelection({ aoiId: r.aoi_id }); setOpen(false); setQ(''); };

  return (
    <div className="pp tour-area" ref={box}>
      <span className="field__lab" id={id + '-l'}>Place</span>
      <button type="button" className="btn pp__btn" aria-haspopup="listbox" aria-expanded={open} aria-labelledby={id + '-l ' + id + '-b'} onClick={() => setOpen(!open)}>
        <MapPin size={16} aria-hidden /><span id={id + '-b'}>{cur?.name ?? aoiId}</span><ChevronDown size={14} aria-hidden />
      </button>
      {open && (
        <div className="pp__pop" role="dialog" aria-label="Choose a place">
          <label className="pp__search"><Search size={14} aria-hidden /><span className="sr-only">Search places</span>
            <input ref={input} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a country, division or state" autoComplete="off" />
          </label>
          <div className="pp__list" role="listbox" aria-label="Places">
            {groups.length === 0 && <p className="muted small pp__none">No place matches &ldquo;{q}&rdquo;.</p>}
            {groups.map((g) => (
              <div key={g.country} className="pp__group" role="group" aria-label={g.country}>
                <p className="pp__gh">{g.country}</p>
                {g.top.map((r) => <PlaceItem key={r.aoi_id} r={r} cur={r.aoi_id === aoiId} onPick={pick} label={`Whole country`} />)}
                {g.sub.map((r) => <PlaceItem key={r.aoi_id} r={r} cur={r.aoi_id === aoiId} onPick={pick} label={displayKind(r)} sub />)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PlaceItem({ r, cur, onPick, label, sub }: { r: Region; cur: boolean; onPick: (r: Region) => void; label: string; sub?: boolean }) {
  return (
    <button type="button" role="option" aria-selected={cur} className={'pp__item' + (sub ? ' pp__item--sub' : '') + (cur ? ' is-cur' : '')} onClick={() => onPick(r)}>
      <span>{r.name}</span><em>{label}</em>
    </button>
  );
}
