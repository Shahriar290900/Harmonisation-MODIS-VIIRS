// The "Joined as recorded" / "On one scale" switch and its one-sentence reading, shared by Two satellites and Home.
export type JumpMode = 'raw' | 'onescale';

export const JUMP_SENTENCE: Record<JumpMode, string> = {
  raw: 'As recorded, the line leaps in 2012, when the sharper satellite joins.',
  onescale: 'On one scale, most of the jump disappears. Before 2012 the dashed line is an estimate.'
};

export function JumpSwitch({ mode, onChange, cta }: { mode: JumpMode; onChange: (m: JumpMode) => void; cta?: boolean }) {
  const one = mode === 'onescale';
  return (
    <div className="jswitch">
      <button type="button" data-jump-toggle aria-pressed={one} className={'jswitch__btn' + (one ? ' is-one' : '')} onClick={() => onChange(one ? 'raw' : 'onescale')}>
        <span className={'jswitch__opt' + (!one ? ' is-on' : '')}>Joined as recorded</span>
        <span className={'jswitch__opt' + (one ? ' is-on' : '')}>On one scale</span>
      </button>
      {cta && !one && <span className="jswitch__cta">See the jump on one scale.</span>}
    </div>
  );
}
