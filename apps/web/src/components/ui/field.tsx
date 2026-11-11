import type { InputHTMLAttributes, ReactElement } from 'react';

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
}

export function Field({
  label,
  error,
  hint,
  id,
  name,
  className = '',
  ...props
}: FieldProps): ReactElement {
  const fieldId = id ?? name;
  const hintId = hint === undefined ? undefined : `${fieldId}-hint`;
  const errorId = error === undefined ? undefined : `${fieldId}-error`;
  const describedBy =
    [hintId, errorId].filter((value) => value !== undefined).join(' ') || undefined;

  return (
    <div className="space-y-1.5">
      <label htmlFor={fieldId} className="block text-sm font-medium text-slate-800">
        {label}
      </label>
      <input
        id={fieldId}
        name={name}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={describedBy}
        className={`w-full rounded-card border bg-white px-3 py-2 text-sm shadow-sm transition placeholder:text-slate-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-100 ${
          error === undefined ? 'border-slate-300' : 'border-red-400'
        } ${className}`}
        {...props}
      />
      {hint !== undefined && hintId !== undefined ? (
        <p id={hintId} className="text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
      {error !== undefined && errorId !== undefined ? (
        <p id={errorId} className="text-xs font-medium text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
