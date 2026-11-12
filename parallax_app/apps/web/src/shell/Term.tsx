import type { ReactNode } from 'react';
import { Tip } from '../ui/Tip';
import { GLOSSARY } from './glossary';

/** A plain-language term with a dotted underline; hover, focus or tap shows what it means. */
export function Term({ k, children }: { k: keyof typeof GLOSSARY | string; children?: ReactNode }) {
  const g = GLOSSARY[k];
  if (!g) return <>{children}</>;
  return (
    <Tip text={<>{g.help}{g.tech && <span className="term__tech"> Technical name: {g.tech}.</span>}</>}>
      <span className="term" tabIndex={0}>{children ?? g.label}</span>
    </Tip>
  );
}
