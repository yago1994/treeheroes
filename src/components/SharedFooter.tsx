import { Link } from 'react-router-dom';
import logoUrl from '../../assets/treeheroes-logo-3.png';

interface SharedFooterProps {
  onOpenMapPath?: string;
}

export function SharedFooter({ onOpenMapPath = "/map" }: SharedFooterProps) {
  return (
    <footer className="bg-[#2d5016] py-14 text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <img src={logoUrl} alt="Tree Heroes Logo" className="h-11 w-11" />
          <span className="text-lg font-semibold">Tree Heroes</span>
        </div>
        <p className="max-w-3xl text-sm text-white/80">
          Making Atlanta&apos;s tree management transparent and accessible
        </p>
        <p className="max-w-3xl text-sm text-white/70">
          Data source: <a href="https://aca-prod.accela.com/ATLANTA_GA/Default.aspx" target="_blank" rel="noopener" className="underline hover:text-white">Atlanta Arborist DDH Permits</a>
        </p>
        <div className="flex flex-wrap items-center gap-6 text-sm text-white/80">
          <Link to="/#map" className="transition-colors hover:text-white">
            Map overview
          </Link>
          <Link to={onOpenMapPath} className="transition-colors hover:text-white">
            Launch map
          </Link>
          <a href="https://github.com/yago1994/treeheroes" target="_blank" rel="noopener" className="transition-colors hover:text-white">
            GitHub
          </a>
          <a href="mailto:info@treeheroesatl.org" className="transition-colors hover:text-white">
            Contact
          </a>
        </div>
        <p className="text-xs text-white/60">© {new Date().getFullYear()} Tree Heroes.</p>
      </div>
    </footer>
  );
}
