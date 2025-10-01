import { memo, useMemo } from 'react';
import type { CSSProperties, KeyboardEvent, MouseEvent } from 'react';
import { Tooltip } from '@heroui/react';
import type { PermitRecord } from './types';
import { buildMarkerStyles } from './markers';

type PermitMarkerProps = {
  lat: number;
  lng: number;
  record: PermitRecord;
  isSelected: boolean;
  onSelect(record: PermitRecord): void;
  style?: CSSProperties;
  className?: string;
};

function handleKeyboardActivate(
  event: KeyboardEvent<HTMLDivElement>,
  record: PermitRecord,
  onSelect: (record: PermitRecord) => void,
): void {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    onSelect(record);
  }
}

function PermitMarkerComponent({
  record,
  isSelected,
  onSelect,
  style,
  className,
}: PermitMarkerProps): JSX.Element {
  const { container, highlight, core, dbh } = useMemo(() => buildMarkerStyles(record), [record]);

  const markerStyle = useMemo(() => {
    const baseShadow = container.boxShadow ?? '0 2px 6px rgba(0, 0, 0, 0.35)';
    const elevatedShadow = `${baseShadow}${isSelected ? ', 0 0 0 3px rgba(58, 157, 58, 0.45)' : ''}`;
    return {
      ...container,
      cursor: 'pointer',
      pointerEvents: 'auto' as const,
      boxShadow: elevatedShadow,
      transition: 'transform 0.2s ease, box-shadow 0.2s ease',
    };
  }, [container, isSelected]);

  const tooltipContent = useMemo(
    () => (
      <div className="flex min-w-[200px] flex-col gap-1">
        <p className="text-sm font-semibold text-foreground">
          {record.address || record.record || 'Permit details'}
        </p>
        <p className="text-xs text-foreground-600">
          Removal reason: {record.reason_removal || 'Unknown'}
        </p>
        {record.tree_dbh && (
          <p className="text-xs text-foreground-600">Reported DBH: {record.tree_dbh}</p>
        )}
      </div>
    ),
    [record.address, record.record, record.reason_removal, record.tree_dbh],
  );

  const handleClick = (event: MouseEvent<HTMLDivElement>): void => {
    event.preventDefault();
    onSelect(record);
  };

  const rootStyle = useMemo(
    () => ({
      ...(style ?? {}),
      pointerEvents: 'auto' as const,
      display: 'inline-flex',
    }),
    [style],
  );

  return (
    <div style={rootStyle} className={className}>
      <Tooltip content={tooltipContent} placement="top" offset={12} showArrow>
        <div
          role="button"
          tabIndex={0}
          aria-label={record.address || record.record || 'Permit marker'}
          onClick={handleClick}
          onKeyDown={(event) => handleKeyboardActivate(event, record, onSelect)}
          style={markerStyle}
          data-dbh={dbh ?? undefined}
        >
          <span style={highlight} />
          <span style={core} />
        </div>
      </Tooltip>
    </div>
  );
}

export default memo(
  PermitMarkerComponent,
  (prev, next) =>
    prev.record === next.record &&
    prev.isSelected === next.isSelected &&
    prev.lat === next.lat &&
    prev.lng === next.lng &&
    prev.onSelect === next.onSelect &&
    prev.className === next.className,
);
