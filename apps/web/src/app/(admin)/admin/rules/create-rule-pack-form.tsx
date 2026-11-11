'use client';

import { useRouter } from 'next/navigation';
import type { FormEvent, ReactElement } from 'react';
import { useState } from 'react';
import { Button } from '../../../../components/ui/button';
import { Field } from '../../../../components/ui/field';
import { ApiError, apiFetch } from '../../../../lib/api';

const DRYWALL_FIELDS = [
  { key: 'sheetAreaM2', label: 'Sheet area (m²)' },
  { key: 'breakageFactor', label: 'Breakage factor' },
  { key: 'screwsPerSheet', label: 'Screws per sheet' },
  { key: 'jointCompoundPerAreaKg', label: 'Joint compound (kg/m²)' },
  { key: 'tapePerAreaM', label: 'Tape (m/m²)' },
  { key: 'deductionThresholdM2', label: 'Deduction threshold (m²)' },
] as const;

const CONCRETE_FIELDS = [
  { key: 'wasteFactor', label: 'Waste factor' },
  { key: 'lapFactor', label: 'Lap factor' },
  { key: 'meshLapFactor', label: 'Mesh lap factor' },
] as const;

export function CreateRulePackForm(): ReactElement {
  const router = useRouter();
  const [trade, setTrade] = useState<'drywall' | 'concrete'>('drywall');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [success, setSuccess] = useState<string | undefined>();
  const fields = trade === 'drywall' ? DRYWALL_FIELDS : CONCRETE_FIELDS;

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const regionPackCode = String(form.get('regionPackCode') ?? '').trim();
    const version = String(form.get('version') ?? '').trim();
    const unitsDisplay = String(form.get('unitsDisplay') ?? '').trim();
    const notes = String(form.get('notes') ?? '').trim();
    setError(undefined);
    setSuccess(undefined);

    if (regionPackCode.length === 0) {
      setError('Enter a region pack code.');
      return;
    }
    if (!/^\d+\.\d+\.\d+$/.test(version)) {
      setError('Version must use x.y.z semver, for example 1.0.0.');
      return;
    }

    const parameters: Record<string, number> = {};
    for (const field of fields) {
      const raw = String(form.get(field.key) ?? '').trim();
      if (raw.length === 0) {
        continue;
      }
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0) {
        setError(`${field.label} must be a non-negative number.`);
        return;
      }
      parameters[field.key] = value;
    }

    setPending(true);
    try {
      await apiFetch<{ rulePack: unknown }>('/admin/rule-packs', {
        method: 'POST',
        body: JSON.stringify({
          trade,
          regionPackCode,
          version,
          parameters,
          ...(unitsDisplay.length === 0 ? {} : { unitsDisplay }),
          ...(notes.length === 0 ? {} : { notes }),
        }),
      });
      setSuccess('Draft rule pack created.');
      formElement.reset();
      setTrade('drywall');
      router.refresh();
    } catch (caught: unknown) {
      setError(caught instanceof ApiError ? caught.message : 'Could not create the rule pack.');
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
      {success === undefined ? null : (
        <p role="status" className="rounded-card bg-green-50 px-3 py-2 text-sm text-green-800">
          {success}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="trade" className="block text-sm font-medium text-slate-800">
            Trade
          </label>
          <select
            id="trade"
            name="trade"
            value={trade}
            onChange={(event) =>
              setTrade(event.target.value === 'concrete' ? 'concrete' : 'drywall')
            }
            className="w-full rounded-card border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="drywall">Drywall</option>
            <option value="concrete">Concrete</option>
          </select>
        </div>
        <Field
          label="Region pack code"
          name="regionPackCode"
          required
          hint="For example US or UK."
        />
        <Field label="Version" name="version" required hint="Semver x.y.z." />
        <Field
          label="Units display"
          name="unitsDisplay"
          hint="Optional label shown to reviewers."
        />
        {fields.map((field) => (
          <Field
            key={field.key}
            label={field.label}
            name={field.key}
            type="number"
            min={0}
            step="any"
            hint="Optional."
          />
        ))}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="notes" className="block text-sm font-medium text-slate-800">
          Notes
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={2}
          maxLength={2000}
          className="w-full rounded-card border border-slate-300 bg-white px-3 py-2 text-sm"
        />
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? 'Creating…' : 'Create draft'}
      </Button>
    </form>
  );
}
