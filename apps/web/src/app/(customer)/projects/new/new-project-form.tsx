'use client';

import { useRouter } from 'next/navigation';
import type { FormEvent, ReactElement } from 'react';
import { useState } from 'react';
import { ApiError, apiFetch, fieldError } from '../../../../lib/api';
import { Button } from '../../../../components/ui/button';
import { Field } from '../../../../components/ui/field';
import type { Project } from '../../../../lib/types';

const REGION_PACKS = [
  { value: 'US', label: 'United States' },
  { value: 'EU', label: 'Europe' },
  { value: 'APAC', label: 'Asia-Pacific' },
  { value: 'OTHER', label: 'Other' },
];

export function NewProjectForm(): ReactElement {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') ?? '').trim();
    const country = String(form.get('country') ?? '').trim();
    const regionPackCode = String(form.get('regionPackCode') ?? 'US');
    const localErrors: Record<string, string> = {};
    if (name.length === 0) {
      localErrors.name = 'Name the project so you can find it later.';
    }
    setFieldErrors(localErrors);
    setError(undefined);
    if (Object.keys(localErrors).length > 0) {
      return;
    }

    setPending(true);
    try {
      const { project } = await apiFetch<{ project: Project }>('/projects', {
        method: 'POST',
        body: JSON.stringify({
          name,
          regionPackCode,
          ...(country.length === 0 ? {} : { location: { country } }),
        }),
      });
      router.push(`/projects/${project._id}`);
      router.refresh();
    } catch (caught: unknown) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        setFieldErrors({
          name: fieldError(caught, 'name') ?? '',
          country: fieldError(caught, 'location.country') ?? '',
        });
      } else {
        setError('Could not create the project. Please try again.');
      }
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="max-w-xl space-y-5">
      {error !== undefined ? (
        <p role="alert" className="rounded-card bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <Field
        label="Project name"
        name="name"
        required
        autoFocus
        placeholder="Riverside apartments — block A"
        error={fieldErrors.name === '' ? undefined : fieldErrors.name}
      />

      <div className="space-y-1.5">
        <label htmlFor="regionPackCode" className="block text-sm font-medium text-slate-800">
          Conversion region
        </label>
        <select
          id="regionPackCode"
          name="regionPackCode"
          defaultValue="US"
          className="w-full rounded-card border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm"
        >
          {REGION_PACKS.map((pack) => (
            <option key={pack.value} value={pack.value}>
              {pack.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-slate-500">
          The region selects the unit and material rules used for conversion.
        </p>
      </div>

      <Field
        label="Country (optional)"
        name="country"
        autoComplete="country-name"
        placeholder="United States"
        error={fieldErrors.country === '' ? undefined : fieldErrors.country}
      />

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Creating…' : 'Create draft'}
        </Button>
        <Button variant="secondary" onClick={() => router.push('/dashboard')} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
