import { Moon, Sun } from 'lucide-react';
import { useTheme } from './theme';

/** Sun/moon switch. Shows the icon of the theme you would switch TO; announces state via aria-pressed on "Dark theme". */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, set] = useTheme();
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      className={'icon-btn theme-toggle ' + className}
      aria-label="Dark theme"
      aria-pressed={dark}
      title={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={() => set(dark ? 'light' : 'dark')}
    >
      {dark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
    </button>
  );
}
export default ThemeToggle;
