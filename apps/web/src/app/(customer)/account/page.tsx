import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { formatDate, formatDateTime, formatMoney, titleCase } from '../../../lib/format';
import { serverApi } from '../../../lib/server-api';
import type { PublicUser, UsageSummary } from '../../../lib/types';
import { PasswordForm } from './password-form';
import { ProfileForm } from './profile-form';

export const metadata: Metadata = { title: 'Account' };

const PLAN_LABELS: Record<string, string> = {
  free_trial: 'Free trial',
  per_takeoff: 'Per takeoff',
  unlimited: 'Unlimited',
};

function UsageSummaryCard({ usage }: { usage: UsageSummary }): ReactElement {
  return (
    <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
      <dt className="text-slate-600">Plan</dt>
      <dd className="text-right font-medium">
        {PLAN_LABELS[usage.planCode] ?? titleCase(usage.planCode)}
      </dd>

      {usage.planVersion === undefined ? null : (
        <>
          <dt className="text-slate-600">Plan version</dt>
          <dd className="text-right font-medium tabular-nums">{usage.planVersion}</dd>
        </>
      )}

      {usage.amountMinor === undefined || usage.currency === undefined ? null : (
        <>
          <dt className="text-slate-600">
            {usage.planCode === 'unlimited' ? 'Monthly price' : 'Price per takeoff'}
          </dt>
          <dd className="text-right font-medium tabular-nums">
            {formatMoney(usage.amountMinor, usage.currency)}
          </dd>
        </>
      )}

      {usage.maxSheets === undefined ? null : (
        <>
          <dt className="text-slate-600">Sheets per takeoff</dt>
          <dd className="text-right font-medium tabular-nums">{usage.maxSheets}</dd>
        </>
      )}

      {usage.trialAvailable ? (
        <>
          <dt className="text-slate-600">Free trial</dt>
          <dd className="text-right font-medium text-green-700">Available</dd>
        </>
      ) : null}

      {usage.trialUsedAt === undefined ? null : (
        <>
          <dt className="text-slate-600">Trial used</dt>
          <dd className="text-right font-medium">{formatDate(usage.trialUsedAt)}</dd>
        </>
      )}

      {usage.used === undefined || usage.includedTakeoffs === undefined ? null : (
        <>
          <dt className="text-slate-600">Takeoffs used</dt>
          <dd className="text-right font-medium tabular-nums">
            {usage.used} of {usage.includedTakeoffs}
          </dd>
          <dt className="text-slate-600">Remaining</dt>
          <dd className="text-right font-medium tabular-nums">{usage.remaining ?? 0}</dd>
          <dt className="text-slate-600">Overage takeoffs</dt>
          <dd className="text-right font-medium tabular-nums">{usage.overageCount ?? 0}</dd>
          {usage.overageAmountMinor === undefined ||
          usage.currency === undefined ||
          (usage.overageCount ?? 0) === 0 ? null : (
            <>
              <dt className="text-slate-600">Overage charge</dt>
              <dd className="text-right font-medium tabular-nums">
                {formatMoney(usage.overageAmountMinor, usage.currency)}
              </dd>
            </>
          )}
          {usage.periodStart === undefined || usage.periodEnd === undefined ? null : (
            <>
              <dt className="text-slate-600">Billing period</dt>
              <dd className="text-right font-medium">
                {formatDateTime(usage.periodStart)} – {formatDateTime(usage.periodEnd)}
              </dd>
            </>
          )}
        </>
      )}
    </dl>
  );
}

export default async function AccountPage(): Promise<ReactElement> {
  const [{ user }, { usage }] = await Promise.all([
    serverApi<{ user: PublicUser }>('/me'),
    serverApi<{ usage: UsageSummary }>('/me/usage'),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
        <p className="mt-1 text-sm text-slate-600">Profile, password and plan usage.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section
          aria-labelledby="profile-heading"
          className="rounded-card border border-slate-200 bg-white p-5"
        >
          <h2 id="profile-heading" className="text-lg font-semibold tracking-tight">
            Profile
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            This name appears on project records. Your email is used to sign in.
          </p>
          <div className="mt-4">
            <ProfileForm user={user} />
          </div>
        </section>

        <section
          aria-labelledby="password-heading"
          className="rounded-card border border-slate-200 bg-white p-5"
        >
          <h2 id="password-heading" className="text-lg font-semibold tracking-tight">
            Password
          </h2>
          <p className="mt-1 text-sm text-slate-600">Use a long, unique password.</p>
          <div className="mt-4">
            <PasswordForm />
          </div>
        </section>
      </div>

      <section
        aria-labelledby="usage-heading"
        className="rounded-card border border-slate-200 bg-white p-5"
      >
        <h2 id="usage-heading" className="text-lg font-semibold tracking-tight">
          Plan and usage
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Entitlements apply when a takeoff is submitted, not while it is a draft.
        </p>
        <UsageSummaryCard usage={usage} />
      </section>
    </div>
  );
}
