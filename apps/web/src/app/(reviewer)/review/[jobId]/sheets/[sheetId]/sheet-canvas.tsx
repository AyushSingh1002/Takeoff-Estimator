'use client';

import { useState } from 'react';
import type { ReactElement } from 'react';
import { formatQuantity, titleCase } from '../../../../../../lib/format';
import type {
  DetectedObject,
  ReviewerMeasurement,
  ReviewerSheet,
  ReviewerSheetDetail,
} from '../../../../../../lib/types';

const CLASS_COLOURS: Record<string, string> = {
  wall: '#2563eb',
  door: '#16a34a',
  window: '#0891b2',
  room: '#9333ea',
  slab: '#ea580c',
  column: '#dc2626',
  other: '#64748b',
};

function objectPoints(object: DetectedObject, height: number): string {
  return object.geometry.coordinates.map(([x = 0, y = 0]) => `${x},${height - y}`).join(' ');
}

function ObjectsLayer({
  objects,
  height,
  selectedId,
  onSelect,
}: {
  objects: DetectedObject[];
  height: number;
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}): ReactElement {
  return (
    <g>
      {objects.map((object) => {
        const colour = CLASS_COLOURS[object.class] ?? CLASS_COLOURS.other ?? '#64748b';
        const selected = object._id === selectedId;
        const lowConfidence = object.confidence !== undefined && object.confidence < 0.5;
        const stroke = selected ? '#f59e0b' : colour;
        const strokeWidth = selected ? 3 : 1.5;
        const common = {
          stroke,
          strokeWidth,
          strokeDasharray: lowConfidence ? '5 3' : undefined,
          onClick: () => onSelect(object._id),
          className: 'cursor-pointer',
        };
        if (object.geometry.kind === 'Polygon') {
          return (
            <polygon
              key={object._id}
              points={objectPoints(object, height)}
              fill={colour}
              fillOpacity={selected ? 0.22 : 0.08}
              {...common}
            />
          );
        }
        if (object.geometry.kind === 'LineString') {
          return (
            <polyline
              key={object._id}
              points={objectPoints(object, height)}
              fill="none"
              {...common}
            />
          );
        }
        const [first] = object.geometry.coordinates;
        if (first === undefined) {
          return null;
        }
        return (
          <circle
            key={object._id}
            cx={first[0] ?? 0}
            cy={height - (first[1] ?? 0)}
            r={selected ? 6 : 4}
            fill={stroke}
            stroke={stroke}
            onClick={() => onSelect(object._id)}
            className="cursor-pointer"
          />
        );
      })}
    </g>
  );
}

function MeasurementsLayer({
  measurements,
  height,
}: {
  measurements: ReviewerMeasurement[];
  height: number;
}): ReactElement {
  return (
    <g>
      {measurements.map((measurement) => {
        if (measurement.geometry === undefined) {
          return null;
        }
        const points = measurement.geometry.coordinates
          .map(([x = 0, y = 0]) => `${x},${height - y}`)
          .join(' ');
        if (measurement.geometry.kind === 'Polygon') {
          return (
            <polygon
              key={measurement._id}
              points={points}
              fill="#f59e0b"
              fillOpacity={0.12}
              stroke="#b45309"
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
          );
        }
        if (measurement.geometry.kind === 'LineString') {
          return (
            <polyline
              key={measurement._id}
              points={points}
              fill="none"
              stroke="#b45309"
              strokeWidth={2}
              strokeDasharray="4 3"
            />
          );
        }
        const [first] = measurement.geometry.coordinates;
        if (first === undefined) {
          return null;
        }
        return (
          <circle
            key={measurement._id}
            cx={first[0] ?? 0}
            cy={height - (first[1] ?? 0)}
            r={4}
            fill="#b45309"
          />
        );
      })}
    </g>
  );
}

export function SheetCanvas({
  detail,
  sheet,
}: {
  detail: ReviewerSheetDetail;
  sheet: ReviewerSheet;
}): ReactElement {
  const [showObjects, setShowObjects] = useState(true);
  const [showMeasurements, setShowMeasurements] = useState(true);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const width = sheet.widthPt ?? 1000;
  const height = sheet.heightPt ?? 700;
  const selected = detail.objects.find((object) => object._id === selectedId);
  const isPdf = detail.image.contentType === 'application/pdf';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-700">
          <label className="flex items-center gap-1.5 font-medium">
            <input
              type="checkbox"
              checked={showObjects}
              onChange={(event) => setShowObjects(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-brand-600"
            />
            Objects ({detail.objects.length})
          </label>
          <label className="flex items-center gap-1.5 font-medium">
            <input
              type="checkbox"
              checked={showMeasurements}
              onChange={(event) => setShowMeasurements(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-brand-600"
            />
            Measurements ({detail.measurements.length})
          </label>
          <span className="text-slate-500">Low-confidence objects use a dashed outline.</span>
        </div>
        <a
          href={detail.image.url}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-medium text-brand-700 hover:underline"
        >
          Open source drawing
        </a>
      </div>

      <div
        className="relative overflow-hidden rounded-card border border-slate-300 bg-slate-800"
        style={{ aspectRatio: `${width} / ${height}` }}
      >
        {isPdf ? (
          <iframe
            title={`Drawing preview for page ${sheet.pageNumber}`}
            src={`${detail.image.url}#toolbar=0&navpanes=0&view=Fit`}
            className="absolute inset-0 h-full w-full bg-white"
          />
        ) : (
          // Signed image pages are rendered directly; no customer data is public.
          <img
            src={detail.image.url}
            alt={`Drawing page ${sheet.pageNumber}`}
            className="absolute inset-0 h-full w-full object-contain bg-white"
          />
        )}
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`Object and measurement overlay for page ${sheet.pageNumber}`}
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          <g className="pointer-events-auto">
            {showObjects ? (
              <ObjectsLayer
                objects={detail.objects}
                height={height}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            ) : null}
            {showMeasurements ? (
              <MeasurementsLayer measurements={detail.measurements} height={height} />
            ) : null}
          </g>
        </svg>
      </div>

      <div aria-live="polite" className="rounded-card border border-slate-200 bg-white p-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Selected object
        </h3>
        {selected === undefined ? (
          <p className="mt-1 text-sm text-slate-600">
            Click an overlay object to inspect its class and confidence.
          </p>
        ) : (
          <div className="mt-1 grid gap-2 text-sm sm:grid-cols-4">
            <p>
              <span className="text-slate-500">Class:</span>{' '}
              <span className="font-medium">{titleCase(selected.class)}</span>
            </p>
            <p>
              <span className="text-slate-500">Geometry:</span>{' '}
              <span className="font-medium">{selected.geometry.kind}</span>
            </p>
            <p>
              <span className="text-slate-500">Confidence:</span>{' '}
              <span className="font-medium tabular-nums">
                {selected.confidence === undefined
                  ? '—'
                  : `${formatQuantity(selected.confidence * 100)}%`}
              </span>
            </p>
            <p className="font-mono text-xs text-slate-500">{selected._id}</p>
          </div>
        )}
        {selected?.confidence !== undefined && selected.confidence < 0.5 ? (
          <p className="mt-2 text-xs font-medium text-amber-800">
            Low confidence — verify this object against the drawing before accepting the related
            quantity.
          </p>
        ) : null}
      </div>
    </div>
  );
}
