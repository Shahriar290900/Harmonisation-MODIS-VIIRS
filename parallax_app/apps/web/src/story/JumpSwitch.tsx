// The "Joined as recorded" / "On one scale" switch and its one-sentence reading, shared by Two satellites and Home.
export type JumpMode = 'raw' | 'onescale';

export const JUMP_SENTENCE: Record<JumpMode, string> = {
  raw: 'As recorded, burning seems to jump in 2012. The older satellite’s counts end and the sharper satellite’s begin, and the line leaps.',
  onescale: 'On one scale, most of that jump disappears: the camera changed. Before 2012 the line is our estimate of what the sharper satellite would have counted, with its likely range shaded.'
};

export function JumpSwitch({ mode, onChange, cta }: { mode: JumpMode; onChange: (m: JumpMode) => void; cta?: boolean }) {
  const one = mode === 'onescale';
  return (
    <div className="jswitch">
      <button type="button" data-jump-toggle aria-pressed={one} className={'jswitch__btn' + (one ? ' is-one' : '')} onClick={() => onChange(one ? 'raw' : 'onescale')}>
        <span className={'jswitch__opt' + (!one ? ' is-on' : '')}>Joined as recorded</span>
        <span className={'jswitch__opt' + (one ? ' is-on' : '')}>On one scale</span>
      </button>
      {cta && !one && <span className="jswitch__cta">Put them on one scale to see how much of the jump is the camera.</span>}
    </div>
  );
}
