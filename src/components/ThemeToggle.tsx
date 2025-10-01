import { Button, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger } from '@heroui/react';
import { useTheme } from '../contexts/ThemeContext';

// SVG Icons for themes
const SunIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5"/>
    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
  </svg>
);

const MoonIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
);

const MonitorIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
    <line x1="8" y1="21" x2="16" y2="21"/>
    <line x1="12" y1="17" x2="12" y2="21"/>
  </svg>
);

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();

  const themeOptions = [
    { key: 'light', label: 'Light', icon: SunIcon },
    { key: 'dark', label: 'Dark', icon: MoonIcon },
    { key: 'system', label: 'System', icon: MonitorIcon },
  ] as const;

  const currentTheme = themeOptions.find(option => option.key === theme) || themeOptions[2];
  const CurrentIcon = currentTheme.icon;

  return (
    <Dropdown>
      <DropdownTrigger>
        <Button
          variant="light"
          size="sm"
          className="min-w-0 px-2 text-white hover:bg-white/10"
          startContent={<CurrentIcon />}
        >
          <span className="hidden sm:inline">{currentTheme.label}</span>
        </Button>
      </DropdownTrigger>
      <DropdownMenu
        aria-label="Theme selection"
        selectedKeys={new Set([theme])}
        onAction={(key) => {
          if (key && ['light', 'dark', 'system'].includes(key as string)) {
            setTheme(key as 'light' | 'dark' | 'system');
          }
        }}
      >
        {themeOptions.map((option) => {
          const IconComponent = option.icon;
          return (
            <DropdownItem key={option.key} startContent={<IconComponent />}>
              {option.label}
              {option.key === 'system' && (
                <span className="text-xs text-default-500 ml-2">
                  ({resolvedTheme})
                </span>
              )}
            </DropdownItem>
          );
        })}
      </DropdownMenu>
    </Dropdown>
  );
}
