import { SharedHeader } from '../components/SharedHeader';
import { SharedFooter } from '../components/SharedFooter';
import MapAppOL from '../components/MapAppOL';

type MapPageProps = {
  apiKey: string;
  mapId: string;
};



export default function MapPage({ apiKey, mapId }: MapPageProps): JSX.Element {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SharedHeader showBackButton={true} />
      <main className="flex flex-1 justify-center overflow-y-auto">
        <div className="flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-semibold text-foreground">Atlanta Tree Removal Permits Map</h1>
            <p className="text-sm text-foreground-600">Filter by date range or removal reason, and tap markers for Street View context.</p>
          </div>
          <div className="flex-1">
            <MapAppOL apiKey={apiKey} mapId={mapId} />
          </div>
        </div>
      </main>
      <SharedFooter />
    </div>
  );
}
