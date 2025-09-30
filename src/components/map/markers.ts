import type { CSSProperties } from 'react';
import { PermitRecord } from './types';

export function extractDbhValue(value: string | null): number | null {
  if (!value) return null;
  const matches = value.match(/\d+(?:\.\d+)?/g);
  if (!matches || !matches.length) return null;
  const numericValues = matches
    .map((match) => Number(match))
    .filter((num) => Number.isFinite(num) && num > 0);
  if (!numericValues.length) return null;
  return Math.max(...numericValues);
}

export function computeMarkerDimensions(
  record: PermitRecord,
): { size: number; coreSize: number; dbh: number | null } {
  const dbh = extractDbhValue(record.tree_dbh);
  if (!dbh) {
    const size = 24;
    const coreSize = 12;
    return { size, coreSize, dbh: null };
  }

  const clampedDbh = Math.min(Math.max(dbh, 4), 60);
  const size = Math.min(40, Math.round(18 + clampedDbh * 0.35));
  const coreSize = Math.max(10, Math.round(size * 0.5));
  return { size, coreSize, dbh };
}

export type MarkerStyles = {
  container: CSSProperties;
  highlight: CSSProperties;
  core: CSSProperties;
  dbh: number | null;
};

export function buildMarkerStyles(record: PermitRecord): MarkerStyles {
  const { size, coreSize, dbh } = computeMarkerDimensions(record);

  const container: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: '50%',
    clipPath:
      'polygon(50% 0%, 66% 4%, 80% 14%, 92% 28%, 98% 44%, 100% 58%, 94% 73%, 82% 86%, 66% 96%, 50% 100%, 34% 96%, 18% 86%, 6% 73%, 0% 58%, 2% 42%, 8% 26%, 20% 12%, 34% 4%)',
    backgroundColor: '#b8804b',
    backgroundImage:
      'radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.35) 0%, rgba(255, 255, 255, 0.1) 18%, rgba(0, 0, 0, 0.08) 55%, rgba(0, 0, 0, 0.18) 100%), ' +
      'repeating-radial-gradient(circle at 50% 50%, #f1d3a2 0px, #f1d3a2 2px, #dea86a 2px, #dea86a 4px, #b36c38 4px, #b36c38 6px)',
    backgroundBlendMode: 'multiply',
    border: '1.5px solid rgba(90, 54, 31, 0.9)',
    boxShadow: '0 2px 6px rgba(0, 0, 0, 0.35)',
    boxSizing: 'border-box',
    padding: `${Math.max(2, Math.round(size * 0.1))}px`,
  };

  const highlight: CSSProperties = {
    position: 'absolute',
    left: '24%',
    top: '22%',
    width: `${Math.max(8, Math.round(size * 0.35))}px`,
    height: `${Math.max(8, Math.round(size * 0.35))}px`,
    borderRadius: '50%',
    background:
      'radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.75) 0%, rgba(255, 255, 255, 0.05) 65%, rgba(255, 255, 255, 0) 100%)',
    pointerEvents: 'none',
    opacity: 0.9,
    zIndex: 1,
  };

  const core: CSSProperties = {
    display: 'block',
    width: `${coreSize}px`,
    height: `${coreSize}px`,
    borderRadius: '50%',
    background:
      'radial-gradient(circle at 50% 50%, #fde8c5 0%, #f1c98c 35%, #d68f4d 70%, rgba(130, 73, 30, 0.85) 100%)',
    boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.25) inset',
    border: '1px solid rgba(133, 79, 43, 0.6)',
    position: 'relative',
    zIndex: 2,
  };

  return {
    container,
    highlight,
    core,
    dbh,
  };
}
