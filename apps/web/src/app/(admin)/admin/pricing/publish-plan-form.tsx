'use client';

import { useRouter } from 'next/navigation';
import type { FormEvent, ReactElement } from 'react';
import { useState } from 'react';
import { Button } from '../../../../components/ui/button';
import { Field } from '../../../../components/ui/field';
import { ApiError, apiFetch } from '../../../../lib/api';

const PLAN_CODES = ['per_takeoff', 'unlimited', 'express_addon', 'free_trial'] as const;

const PARAMETER_FIELDS = [
  { key: 'includedTakeoffs', label: 'Included takeoffs', integer: true, positive: true },
  {
    key: 'overageAmountMinor',
    label: 'Overage amount (minor units)',
    integer: true,
    positive: false,
  },
  { key: 'maxSheets', label: 'Maximum sheets', integer: true, positive: true },
  { key: 'turnaroundHours', label: 'Turnaround hours', integer: false, positive: true },
] as const;

export function PublishPlanForm(): ReactElement {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [success, setSuccess] = useState<string | undefined>();

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const code = String(form.get('code') ?? '');
    const currency = String(form.get('currency') ?? '')
      .trim()
      .toUpperCase();
    const amountMinor = Number(form.get('amountMinor'));
    const effectiveFrom = String(form.get('effectiveFrom') ?? '').trim();
    setError(undefined);
    setSuccess(undefined);

    if (!/^[A-Z]{3}$/.test(currency)) {
      setError('Currency must be a three-letter ISO code, for example USD.');
      return;
    }
    if (!Number.isInteger(amountMinor) || amountMinor < 0) {
      setError('Amount must be a whole number of minor units (cents for USD).');
      return;
    }
    if (effectiveFrom.length > 0 && Number.isNaN(new Date(effectiveFrom).getTime())) {
      setError('Enter a valid effective date.');
      return;
    }

    const parameters: Record<string, number> = {};
    for (const field of PARAMETER_FIELDS) {
      const raw = String(form.get(field.key) ?? '').trim();
      if (raw.length === 0) {
        continue;
      }
      const value = Number(raw);
      if (
        !Number.isFinite(value) ||
        value < 0 ||
        (field.positive && value <= 0) ||
        (field.integer && !Number.isInteger(value))
      ) {
        setError(
          `${field.label} must be a ${field.positive ? 'positive' : 'non-negative'} number.`,
        );
        return;
      }
      parameters[field.key] = value;
    }

    setPending(true);
    try {
      await apiFetch<{ plan: unknown }>('/admin/pricing-plans', {
        method: 'POST',
        body: JSON.stringify({
          code,
          currency,
          amountMinor,
          parameters,
          ...(effectiveFrom.length === 0
            ? {}
            : { effectiveFrom: new Date(effectiveFrom).toISOString() }),
        }),
      });
      setSuccess('New plan version published.');
      formElement.reset();
      router.refresh();
    } catch (caught: unknown) {
      setError(caught instanceof ApiError ? caught.message : 'Could not publish the plan.');
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
          <label htmlFor="plan-code" className="block text-sm font-medium text-slate-800">
            Plan
          </label>
          <select
            id="plan-code"
            name="code"
            className="w-full rounded-card border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            {PLAN_CODES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </div>
        <Field
          label="Currency"
          name="currency"
          defaultValue="USD"
          maxLength={3}
          required
          hint="ISO 4217, for example USD."
        />
        <Field
          label="Amount (minor units)"
          name="amountMinor"
          type="number"
          min={0}
          step={1}
          required
          hint="Entered in minor units (cents for USD)."
        />
        <Field
          label="Effective from"
          name="effectiveFrom"
          type="datetime-local"
          hint="Leave blank to publish immediately."
        />
        {PARAMETER_FIELDS.map((field) => (
          <Field
            key={field.key}
            label={field.label}
            name={field.key}
            type="number"
            min={0}
            step={field.key === 'turnaroundHours' ? '0.5' : '1'}
            hint="Optional."
          />
        ))}
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? 'Publishing…' : 'Publish new version'}
      </Button>
    </form>
  );
}
