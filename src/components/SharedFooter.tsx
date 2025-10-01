import { Link } from 'react-router-dom';

interface SharedFooterProps {
  onOpenMapPath?: string;
}

export function SharedFooter({ onOpenMapPath = "/map" }: SharedFooterProps) {
  return (
    <footer className="bg-primary py-14 text-primary-foreground">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <img src="/assets/treeheroes-logo-3.png" alt="Tree Heroes Logo" className="h-11 w-11" />
          <span className="text-lg font-semibold">Tree Heroes</span>
        </div>
        <p className="max-w-3xl text-sm text-primary-foreground/70">
          Built with open data to keep Atlanta&apos;s canopy thriving. Licensed under ISC. Contributions welcome—fork the project and help neighbors defend their shade.
        </p>
        <div className="flex flex-wrap items-center gap-6 text-sm text-primary-foreground/75">
          <a href="#map" className="transition-colors hover:text-primary-foreground">
            Map overview
          </a>
          <Link to={onOpenMapPath} className="transition-colors hover:text-primary-foreground">
            Launch map
          </Link>
          <a href="https://github.com/elibosley/treeheroes" target="_blank" rel="noopener" className="transition-colors hover:text-primary-foreground">
            GitHub
          </a>
          <a href="mailto:info@treeheroes.org" className="transition-colors hover:text-primary-foreground">
            Contact
          </a>
        </div>
        <p className="text-xs text-primary-foreground/60">© {new Date().getFullYear()} Tree Heroes.</p>
      </div>
    </footer>
  );
}
