import { Moon, Sun } from 'lucide-react'

export type AppearanceTheme = 'dark' | 'light'

export function ThemeToggle({ theme, onToggle }: { theme: AppearanceTheme; onToggle: () => void }) {
  const light = theme === 'light'
  return <button className="appearance-toggle" onClick={onToggle} aria-pressed={light} aria-label={`Switch to ${light ? 'dark' : 'light'} mode`} title={`Switch to ${light ? 'dark' : 'light'} mode`}>
    {light ? <Moon size={15} /> : <Sun size={15} />}
    <span>{light ? 'Dark' : 'Light'}</span>
  </button>
}
