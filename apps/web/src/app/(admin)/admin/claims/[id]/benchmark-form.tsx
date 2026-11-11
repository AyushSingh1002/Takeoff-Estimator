'use client';

import { useRouter } from 'next/navigation';
import type { FormEvent, ReactElement } from 'react';
import { useState } from 'react';
import { Button } from '../../../../../components/ui/button';
import { ApiError, apiFetch } from '../../../../../lib/api';

interface LineDraft {
  trade: string;
  code: string;
  benchmarkQuantity: string;
  unit: string;
}

const UNITS = ['m', 'm2', 'm3', 'count'] as const;
const SOURCES = [
  { value: 'customer_challenge', label: 'Customer challenge' },
  { value: 'licensed_estimator', label: 'Licensed estimator' },
  { value: 'golden_set', label: 'Golden set' },
] as const;

function emptyLine(): LineDraft {
  return { trade: 'drywall', code: '', benchmarkQuantity: '', unit: 'm2' };
}

export function BenchmarkForm({ claimId }: { claimId: string }): ReactElement {
  const router = useRouter();
  const [source, setSource] = useState<string>('customer_challenge');
  const [metricVersion, setMetricVersion] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();

  function updateLine(index: number, patch: Partial<LineDraft>): void {
    setLines((current) =>
      current.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)),
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(undefined);
    if (lines.length === 0) {
      setError('Add at least one benchmark line.');
      return;
    }
    const payloadLines = [];
    for (const [index, line] of lines.entries()) {
      const quantity = Number(line.benchmarkQuantity);
      if (line.code.trim().length === 0) {
        setError(`Line ${index + 1}: enter a BOQ code.`);
        return;
      }
      if (!Number.isFinite(quantity) || quantity <= 0) {
        setError(`Line ${index + 1}: benchmark quantity must be greater than zero.`);
        return;
      }
      payloadLines.push({
        trade: line.trade.trim(),
        code: line.code.trim(),
        benchmarkQuantity: quantity,
        unit: line.unit,
      });
    }
    if (metricVersion.trim().length > 0 && !/^[A-Za-z0-9._-]+$/.test(metricVersion.trim())) {
      setError('Metric version may contain letters, numbers, dots, underscores and dashes.');
      return;
    }

    setPending(true);
    try {
      await apiFetch(`/admin/accuracy-claims/${claimId}/benchmark`, {
        method: 'POST',
        body: JSON.stringify({
          source,
          ...(metricVersion.trim().length === 0 ? {} : { metricVersion: metricVersion.trim() }),
          lines: payloadLines,
        }),
      });
      router.refresh();
    } catch (caught: unknown) {
      setError(caught instanceof ApiError ? caught.message : 'Could not record the benchmark.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error === undefined ? null : (
        <p role="alert" className="rounded-card bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="source" className="block text-sm font-medium text-slate-800">
            Benchmark source
          </label>
          <select
            id="source"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            className="w-full rounded-card border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            {SOURCES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="metricVersion" className="block text-sm font-medium text-slate-800">
            Metric version
          </label>
          <input
            id="metricVersion"
            value={metricVersion}
            onChange={(event) => setMetricVersion(event.target.value)}
            placeholder="od02.v1"
            className="w-full rounded-card border border-slate-300 bg-white px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="space-y-3">
        {lines.map((line, index) => (
          <div key={index} className="rounded-card border border-slate-200 bg-slate-50 p-3">
            <div className="grid gap-3 sm:grid-cols-5">
              <div className="space-y-1">
                <label
                  htmlFor={`trade-${index}`}
                  className="block text-xs font-medium text-slate-700"
                >
                  Trade
                </label>
                <input
                  id={`trade-${index}`}
                  value={line.trade}
                  onChange={(event) => updateLine(index, { trade: event.target.value })}
                  className="w-full rounded-card border border-slate-300 bg-white px-2 py-1.5 text-sm"
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label
                  htmlFor={`code-${index}`}
                  className="block text-xs font-medium text-slate-700"
                >
                  BOQ code
                </label>
                <input
                  id={`code-${index}`}
                  value={line.code}
                  onChange={(event) => updateLine(index, { code: event.target.value })}
                  placeholder="drywall.board"
                  className="w-full rounded-card border border-slate-300 bg-white px-2 py-1.5 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label
                  htmlFor={`quantity-${index}`}
                  className="block text-xs font-medium text-slate-700"
                >
                  Benchmark quantity
                </label>
                <input
                  id={`quantity-${index}`}
                  type="number"
                  min={0}
                  step="any"
                  value={line.benchmarkQuantity}
                  onChange={(event) => updateLine(index, { benchmarkQuantity: event.target.value })}
                  className="w-full rounded-card border border-slate-300 bg-white px-2 py-1.5 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label
                  htmlFor={`unit-${index}`}
                  className="block text-xs font-medium text-slate-700"
                >
                  Unit
                </label>
                <select
                  id={`unit-${index}`}
                  value={line.unit}
                  onChange={(event) => updateLine(index, { unit: event.target.value })}
                  className="w-full rounded-card border border-slate-300 bg-white px-2 py-1.5 text-sm"
                >
                  {UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {lines.length > 1 ? (
              <div className="mt-2 text-right">
                <Button
                  variant="ghost"
                  className="px-2 py-1 text-xs"
                  onClick={() =>
                    setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))
                  }
                >
                  Remove line
                </Button>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          disabled={pending || lines.length >= 50}
          onClick={() => setLines((current) => [...current, emptyLine()])}
        >
          Add line
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? 'Recording…' : 'Record benchmark'}
        </Button>
      </div>
    </form>
  );
}
