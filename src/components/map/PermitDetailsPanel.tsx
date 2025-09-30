import { useCallback, useState } from 'react';
import { Badge, Button, Card, CardBody, CardHeader, Divider, Tooltip } from '@heroui/react';
import { AnchorIcon, CheckIcon, CopyIcon, LinkIcon } from '@heroui/shared-icons';
import type { PermitRecord } from './types';

export type PermitDetailsPanelProps = {
  record: PermitRecord | null;
  onClear: () => void;
};

function buildStreetViewUrl(record: PermitRecord): string {
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${record.latLng.lat},${record.latLng.lng}`;
}

const infoEntries: Array<{ key: keyof PermitRecord; label: string }> = [
  { key: 'status', label: 'Status' },
  { key: 'date', label: 'Date' },
  { key: 'description', label: 'Description' },
  { key: 'tree_number', label: 'Tree #' },
  { key: 'species', label: 'Species' },
  { key: 'tree_dbh', label: 'Tree Size (DBH)' },
  { key: 'tree_location', label: 'Tree Location' },
  { key: 'tree_description', label: 'Tree Description' },
  { key: 'reason_removal', label: 'Reason' },
  { key: 'owner', label: 'Owner' },
];

export function PermitDetailsContent({ record }: { record: PermitRecord }): JSX.Element {
  const [copied, setCopied] = useState(false);

  const recordLabel = record.record ?? record.address ?? 'Permit';
  const streetViewUrl = buildStreetViewUrl(record);

  const handleCopy = useCallback(() => {
    if (!record.record) return;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(record.record)
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        })
        .catch(() => setCopied(false));
    }
  }, [record.record]);

  const hasDetails = infoEntries.some(({ key }) => !!record[key]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h3 className="text-lg font-semibold text-slate-900">{recordLabel}</h3>
            {record.address && (
              <div className="flex items-center gap-1 text-sm text-slate-500">
                <AnchorIcon className="h-4 w-4 text-emerald-600" />
                <span>{record.address}</span>
              </div>
            )}
          </div>
          {record.record && (
            <Tooltip content={copied ? 'Copied!' : 'Copy permit number'} color={copied ? 'success' : 'default'}>
              <Button
                isIconOnly
                variant="light"
                color={copied ? 'success' : 'default'}
                onPress={handleCopy}
                aria-label="Copy permit number"
              >
                {copied ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
              </Button>
            </Tooltip>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {record.status && (
            <Badge color="success" variant="flat">
              {record.status}
            </Badge>
          )}
          {record.date && (
            <Badge color="default" variant="flat">
              {record.date}
            </Badge>
          )}
        </div>
      </div>

      <Button
        as="a"
        href={streetViewUrl}
        target="_blank"
        rel="noopener"
        variant="bordered"
        color="success"
        endContent={<LinkIcon className="h-4 w-4" />}
      >
        Open in Google Maps Street View
      </Button>

      {hasDetails ? (
        <div className="flex flex-col gap-3">
          {infoEntries.map(({ key, label }) => {
            const value = record[key];
            if (!value) return null;
            return (
              <div key={key} className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
                <span className="text-sm text-slate-700">{String(value)}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-slate-500">No additional metadata is available for this permit.</p>
      )}
    </div>
  );
}

export default function PermitDetailsPanel({ record, onClear }: PermitDetailsPanelProps): JSX.Element {
  return (
    <Card radius="lg" shadow="sm" className="h-full">
      <CardHeader className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-slate-900">Permit Details</p>
        {record && (
          <Button size="sm" variant="light" onPress={onClear}>
            Clear selection
          </Button>
        )}
      </CardHeader>
      <Divider className="mb-2" />
      <CardBody className="flex flex-col gap-4">
        {record ? (
          <PermitDetailsContent record={record} />
        ) : (
          <p className="text-sm text-slate-500">Select a marker to view permit metadata here.</p>
        )}
      </CardBody>
    </Card>
  );
}
