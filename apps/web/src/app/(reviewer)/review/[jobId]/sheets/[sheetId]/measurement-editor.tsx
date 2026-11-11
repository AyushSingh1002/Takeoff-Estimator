'use client';

import { useRouter } from 'next/navigation';
import type { FormEvent, ReactElement } from 'react';
import { useState } from 'react';
import { Button } from '../../../../../../components/ui/button';
import { ApiError, apiFetch } from '../../../../../../lib/api';
import { formatQuantity, titleCase } from '../../../../../../lib/format';
import type { ReviewerMeasurement } from '../../../../../../lib/types';

function MeasurementRow({
  jobId,
  measurement,
}: {
  jobId: string;
  measurement: ReviewerMeasurement;
}): ReactElement {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(measurement.value));
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('Enter a positive value.');
      return;
    }
    if (note.trim().length === 0) {
      setError('Add a note describing the correction.');
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      await apiFetch<{ measurement: ReviewerMeasurement }>(
        `/review/jobs/${jobId}/measurements/${measurement._id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ value: parsed, note: note.trim() }),
        },
      );
      router.refresh();
    } catch (caught: unknown) {
      setError(caught instanceof ApiError ? caught.message : 'Could not save the measurement.');
      setPending(false);
    }
  }

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-slate-900">
            {titleCase(measurement.type)} · {formatQuantity(measurement.value)} {measurement.unit}
          </p>
          <p className="mt-0.5 font-mono text-[0.7rem] text-slate-500">
            {measurement.annotationId ?? measurement._id} · {measurement.method} · confidence{' '}
            {formatQuantity(measurement.confidence * 100)}%
          </p>
          {measurement.geometry === undefined ? null : (
            <p className="mt-0.5 text-[0.7rem] text-slate-500">
              Geometry: {measurement.geometry.kind} ({measurement.geometry.coordinates.length}{' '}
              points)
            </p>
          )}
        </div>
        <Button
          variant="secondary"
          onClick={() => setEditing((current) => !current)}
          disabled={pending}
          className="px-2 py-1 text-xs"
        >
          Edit value
        </Button>
      </div>

      {editing ? (
        <form onSubmit={save} className="mt-2 space-y-2 rounded-card bg-slate-50 p-2">
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs font-medium text-slate-700">
              Corrected value ({measurement.unit})
              <input
                type="number"
                min={0.0001}
                step="any"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                className="mt-1 block w-28 rounded-card border border-slate-300 bg-white px-2 py-1 font-mono text-sm"
              />
            </label>
            <label className="min-w-48 flex-1 text-xs font-medium text-slate-700">
              Audit note
              <input
                type="text"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={500}
                className="mt-1 block w-full rounded-card border border-slate-300 bg-white px-2 py-1 text-sm"
              />
            </label>
            <Button type="submit" variant="secondary" disabled={pending}>
              {pending ? 'Saving…' : 'Save correction'}
            </Button>
          </div>
          <p className="text-[0.7rem] text-slate-500">
            Original value {formatQuantity(measurement.value)} {measurement.unit}. The linked bill
            line is recomputed and the change is written to the audit log.
          </p>
          {error !== undefined ? (
            <p role="alert" className="text-xs font-medium text-red-700">
              {error}
            </p>
          ) : null}
        </form>
      ) : null}
    </li>
  );
}

function AddMeasurementForm({ jobId }: { jobId: string }): ReactElement {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState('area');
  const [unit, setUnit] = useState('m2');
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [success, setSuccess] = useState<string | undefined>();

  function changeType(next: string): void {
    setType(next);
    if (next === 'length') {
      setUnit('m');
    } else if (next === 'volume') {
      setUnit('m3');
    } else if (next === 'count') {
      setUnit('count');
    } else {
      setUnit('m2');
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('Enter a positive value.');
      return;
    }
    if (note.trim().length === 0) {
      setError('Add a note describing the manual measurement.');
      return;
    }
    setPending(true);
    setError(undefined);
    setSuccess(undefined);
    try {
      await apiFetch<{ measurement: ReviewerMeasurement }>(`/review/jobs/${jobId}/measurements`, {
        method: 'POST',
        body: JSON.stringify({ type, unit, value: parsed, note: note.trim() }),
      });
      setSuccess('Manual measurement added.');
      setValue('');
      setNote('');
      router.refresh();
    } catch (caught: unknown) {
      setError(caught instanceof ApiError ? caught.message : 'Could not add the measurement.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="border-t border-slate-200 px-4 py-3">
      <Button
        variant="secondary"
        onClick={() => setOpen((current) => !current)}
        disabled={pending}
        className="text-xs"
      >
        {open ? 'Close manual measurement' : 'Add manual measurement'}
      </Button>
      {open ? (
        <form onSubmit={submit} className="mt-2 flex flex-wrap items-end gap-2">
          <label className="text-xs font-medium text-slate-700">
            Type
            <select
              value={type}
              onChange={(event) => changeType(event.target.value)}
              className="mt-1 block rounded-card border border-slate-300 bg-white px-2 py-1 text-sm"
            >
              <option value="length">Length</option>
              <option value="area">Area</option>
              <option value="volume">Volume</option>
              <option value="count">Count</option>
            </select>
          </label>
          <label className="text-xs font-medium text-slate-700">
            Unit
            <select
              value={unit}
              onChange={(event) => setUnit(event.target.value)}
              className="mt-1 block rounded-card border border-slate-300 bg-white px-2 py-1 text-sm"
            >
              <option value="m">m</option>
              <option value="m2">m2</option>
              <option value="m3">m3</option>
              <option value="count">count</option>
            </select>
          </label>
          <label className="text-xs font-medium text-slate-700">
            Value
            <input
              type="number"
              min={0.0001}
              step="any"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              className="mt-1 block w-28 rounded-card border border-slate-300 bg-white px-2 py-1 font-mono text-sm"
            />
          </label>
          <label className="min-w-48 flex-1 text-xs font-medium text-slate-700">
            Note
            <input
              type="text"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={500}
              className="mt-1 block w-full rounded-card border border-slate-300 bg-white px-2 py-1 text-sm"
            />
          </label>
          <Button type="submit" disabled={pending}>
            {pending ? 'Adding…' : 'Add measurement'}
          </Button>
          {error !== undefined ? (
            <p role="alert" className="w-full text-xs font-medium text-red-700">
              {error}
            </p>
          ) : null}
          {success !== undefined ? (
            <p role="status" className="w-full text-xs font-medium text-green-700">
              {success}
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}

export function MeasurementEditor({
  jobId,
  measurements,
}: {
  jobId: string;
  measurements: ReviewerMeasurement[];
}): ReactElement {
  return (
    <section
      aria-labelledby="measurements-heading"
      className="rounded-card border border-slate-200 bg-white"
    >
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h2 id="measurements-heading" className="text-sm font-semibold text-slate-900">
          Measurement ledger
        </h2>
        <p className="text-xs text-slate-500">{measurements.length} rows</p>
      </div>
      {measurements.length === 0 ? (
        <p className="px-4 py-4 text-sm text-slate-600">
          No measurements on this sheet yet. Add a manual measurement if the drawing needs one.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {measurements.map((measurement) => (
            <MeasurementRow key={measurement._id} jobId={jobId} measurement={measurement} />
          ))}
        </ul>
      )}
      <AddMeasurementForm jobId={jobId} />
    </section>
  );
}
