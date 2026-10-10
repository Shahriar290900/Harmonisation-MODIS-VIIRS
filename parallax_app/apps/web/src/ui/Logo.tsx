export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="logo">
      <defs>
        <linearGradient id="lf-ui" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#DC2626" /><stop offset="0.55" stopColor="#F97316" /><stop offset="1" stopColor="#FCD34D" />
        </linearGradient>
      </defs>
      <rect x="6" y="10" width="52" height="48" rx="9" fill="#111A2E" stroke="#2B3B5E" strokeWidth="2.5" />
      <path d="M6 22h52" stroke="#2B3B5E" strokeWidth="2.5" />
      <rect x="17" y="5" width="5" height="11" rx="2.5" fill="#93A4C3" />
      <rect x="42" y="5" width="5" height="11" rx="2.5" fill="#93A4C3" />
      <g fill="#1E2A44">
        <rect x="12" y="27" width="8" height="6" rx="1.5" /><rect x="23" y="27" width="8" height="6" rx="1.5" /><rect x="45" y="27" width="8" height="6" rx="1.5" />
        <rect x="12" y="37" width="8" height="6" rx="1.5" /><rect x="45" y="37" width="8" height="6" rx="1.5" />
        <rect x="12" y="47" width="8" height="6" rx="1.5" /><rect x="45" y="47" width="8" height="6" rx="1.5" />
      </g>
      <path d="M33.5 26c1.2 5.2 8.8 8.6 8.8 17.2 0 6.1-4.6 10.3-10.3 10.3s-10.3-4.2-10.3-10.1c0-4.2 2.1-7.1 4.6-9.2-.2 2.9.8 4.9 2.8 5.9-.9-6.1 1.8-10.8 4.4-14.1z" fill="url(#lf-ui)" />
      <path d="M32.2 40.5c.7 2.8 4.4 4.1 4.4 8.1 0 2.8-2.1 4.7-4.6 4.7s-4.6-1.9-4.6-4.6c0-2.3 1.3-3.6 2.4-4.6.2 1.4.8 2.2 1.6 2.6-.4-2.5.1-4.4.8-6.2z" fill="#FEF3C7" />
    </svg>
  );
}
