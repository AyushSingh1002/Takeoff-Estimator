import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { StatusBadge } from '../../../../components/ui/status-badge';
import {
  formatDate,
  formatMoney,
  pricingPlanLabel,
  rulePackParameterSummary,
} from '../../../../lib/format';
import { serverApi } from '../../../../lib/server-api';
import type { PricingPlan } from '../../../../lib/types';
import { PublishPlanForm } from './publish-plan-form';

export const metadata: Metadata = { title: 'Admin · Pricing' };

function parameterSummary(plan: PricingPlan): string {
  const parameters: Record<string, number> = {};
  for (const [key, value] of Object.entries(plan.parameters)) {
    if (typeof value === 'number') {
      parameters[key] = value;
    }
  }
  return rulePackParameterSummary(parameters);
}

export default async function AdminPricingPage(): Promise<ReactElement> {
  const { plans } = await serverApi<{ plans: PricingPlan[] }>('/admin/pricing-plans');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pricing</h1>
        <p className="mt-1 text-sm text-slate-600">
          Publishing creates a new immutable version. A version effective now retires the previous
          active version; a future version becomes active on its effective date.
        </p>
      </div>

      <details className="rounded-card border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-medium text-slate-900">
          Publish a new plan version
        </summary>
        <div className="mt-4">
          <PublishPlanForm />
        </div>
      </details>

      <div className="overflow-x-auto rounded-card border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">
                Plan
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Version
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Status
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Amount
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Effective from
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Parameters
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {plans.map((plan) => (
              <tr key={plan._id} className="align-top">
                <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">
                  {pricingPlanLabel(plan.code)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 tabular-nums">{plan.version}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  <StatusBadge status={plan.status} label={plan.status} />
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {formatMoney(plan.amountMinor, plan.currency)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                  {formatDate(plan.effectiveFrom)}
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">{parameterSummary(plan)}</td>
              </tr>
            ))}
            {plans.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                  No pricing plans have been published.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
