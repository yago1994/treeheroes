import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import MapPage from './pages/MapPage';

declare global {
  interface Window {
    TREEHEROES_CONFIG?: {
      googleMapsApiKey?: string;
      googleMapsMapId?: string;
    };
    TREEHEROES_GOOGLE_MAPS_API_KEY?: string;
    TREEHEROES_GOOGLE_MAPS_MAP_ID?: string;
  }
}

function resolveGoogleMapsKey(): { apiKey: string; mapId: string } {
  const envKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const envMapId = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID;
  const globalConfig = typeof window !== 'undefined' ? window.TREEHEROES_CONFIG : undefined;
  const configKey =
    globalConfig && typeof globalConfig.googleMapsApiKey === 'string'
      ? globalConfig.googleMapsApiKey.trim()
      : '';
  const configMapId =
    globalConfig && typeof globalConfig.googleMapsMapId === 'string'
      ? globalConfig.googleMapsMapId.trim()
      : '';
  const windowKey =
    typeof window !== 'undefined' && typeof window.TREEHEROES_GOOGLE_MAPS_API_KEY === 'string'
      ? window.TREEHEROES_GOOGLE_MAPS_API_KEY.trim()
      : '';
  const windowMapId =
    typeof window !== 'undefined' && typeof window.TREEHEROES_GOOGLE_MAPS_MAP_ID === 'string'
      ? window.TREEHEROES_GOOGLE_MAPS_MAP_ID.trim()
      : '';

  const apiKey = (envKey && envKey.trim()) || configKey || windowKey;
  const mapId = (envMapId && envMapId.trim()) || configMapId || windowMapId;
  return { apiKey, mapId };
}

export default function App(): JSX.Element {
  const { apiKey, mapId } = resolveGoogleMapsKey();

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage onOpenMapPath="/map" />} />
        <Route path="/map" element={<MapPage apiKey={apiKey} mapId={mapId} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
