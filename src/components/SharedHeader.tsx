import { Link } from 'react-router-dom';
import { Button } from '@heroui/react';
import { ThemeToggle } from './ThemeToggle';

type NavLink = {
  label: string;
  href: string;
};

const navLinks: NavLink[] = [
  { label: 'Purpose', href: '#purpose' },
  { label: 'How it works', href: '#instructions' },
];

interface SharedHeaderProps {
  showBackButton?: boolean;
  backButtonText?: string;
  backButtonPath?: string;
}

export function SharedHeader({ 
  showBackButton = false, 
  backButtonText = "Back to overview",
  backButtonPath = "/"
}: SharedHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-divider bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2 text-foreground">
          <img src="/assets/treeheroes-logo-3.png" alt="Tree Heroes Logo" className="h-11 w-11" />
          <span className="text-lg font-semibold text-foreground">Tree Heroes</span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm font-semibold text-foreground-600 sm:flex">
          {navLinks.map((link) => (
            <a key={link.href} href={link.href} className="transition-colors hover:text-primary">
              {link.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          {showBackButton ? (
            <Button 
              as={Link} 
              to={backButtonPath} 
              color="primary" 
              radius="full" 
              variant="solid" 
              className="hidden sm:inline-flex"
            >
              {backButtonText}
            </Button>
          ) : (
            <Button 
              as={Link} 
              to="/map" 
              color="primary" 
              radius="full" 
              variant="solid" 
              className="hidden sm:inline-flex"
            >
              Go to map
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
