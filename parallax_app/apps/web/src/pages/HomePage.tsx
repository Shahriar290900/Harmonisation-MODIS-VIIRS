import { lazy, Suspense } from 'react';

// The story landing (three.js loads only from inside it). It brings its own header, so it is shown without the app shell.
const Landing = lazy(() => import('../experience/landing/Landing'));

export default function HomePage() {
  return (
    <Suspense fallback={<div className="boot" aria-busy="true"><div className="boot__spin" /><p>Loading…</p></div>}>
      <Landing />
    </Suspense>
  );
}
