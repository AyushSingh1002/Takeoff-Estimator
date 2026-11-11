import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { StatusBadge } from '../../../../components/ui/status-badge';
import {
  formatDate,
  rulePackParameterSummary,
  rulePackStatusLabel,
  titleCase,
} from '../../../../lib/format';
import { serverApi } from '../../../../lib/server-api';
import type { RulePack } from '../../../../lib/types';
import { CreateRulePackForm } from './create-rule-pack-form';
import { RulePackActions } from './rule-pack-actions';

export const metadata: Metadata = { title: 'Admin · Rule packs' };

function versionParts(version: string): number[] {
  return version.split('.').map((part) => Number.parseInt(part, 10) || 0);
}

function compareVersionsDesc(a: RulePack, b: RulePack): number {
  const left = versionParts(a.version);
  const right = versionParts(b.version);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (right[index] ?? 0) - (left[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}

function parameterDiff(current: RulePack, previous: RulePack): string[] {
  const keys = new Set([...Object.keys(current.parameters), ...Object.keys(previous.parameters)]);
  const changes: string[] = [];
  for (const key of keys) {
    const before = previous.parameters[key];
    const after = current.parameters[key];
    if (before === after) {
      continue;
    }
    changes.push(`${key}: ${before ?? '—'} → ${after ?? '—'}`);
  }
  return changes;
}

function previousVersions(rulePacks: RulePack[]): Map<string, RulePack> {
  const groups = new Map<string, RulePack[]>();
  for (const rulePack of rulePacks) {
    const key = `${rulePack.trade}:${rulePack.regionPackCode}`;
    const group = groups.get(key) ?? [];
    group.push(rulePack);
    groups.set(key, group);
  }
  const previous = new Map<string, RulePack>();
  for (const group of groups.values()) {
    group.sort(compareVersionsDesc);
    for (let index = 0; index < group.length - 1; index += 1) {
      const current = group[index];
      const before = group[index + 1];
      if (current !== undefined && before !== undefined) {
        previous.set(current._id, before);
      }
    }
  }
  return previous;
}

export default async function AdminRulesPage(): Promise<ReactElement> {
  const { rulePacks } = await serverApi<{ rulePacks: RulePack[] }>('/admin/rule-packs');
  const previous = previousVersions(rulePacks);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Rule packs</h1>
        <p className="mt-1 text-sm text-slate-600">
          Rule packs move from draft to approved, then retire. Approved packs are immutable; create
          a new version to change parameters.
        </p>
      </div>

      <details className="rounded-card border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-medium text-slate-900">
          Create a draft rule pack
        </summary>
        <div className="mt-4">
          <CreateRulePackForm />
        </div>
      </details>

      <div className="overflow-x-auto rounded-card border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">
                Trade
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Region
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Version
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Status
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Parameters
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Approved
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rulePacks.map((rulePack) => (
              <tr key={rulePack._id} className="align-top">
                <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">
                  {titleCase(rulePack.trade)}
                </td>
                <td className="whitespace-nowrap px-4 py-3">{rulePack.regionPackCode}</td>
                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">
                  {rulePack.version}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <StatusBadge
                    status={rulePack.status}
                    label={rulePackStatusLabel(rulePack.status)}
                  />
                </td>
                <td className="max-w-md px-4 py-3 text-xs text-slate-600">
                  {rulePackParameterSummary(rulePack.parameters)}
                  {rulePack.unitsDisplay === undefined ? null : (
                    <p className="mt-1 text-slate-500">Units: {rulePack.unitsDisplay}</p>
                  )}
                  {rulePack.notes === undefined ? null : (
                    <p className="mt-1 text-slate-500">{rulePack.notes}</p>
                  )}
                  {(() => {
                    const before = previous.get(rulePack._id);
                    if (before === undefined) {
                      return null;
                    }
                    const changes = parameterDiff(rulePack, before);
                    return (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-slate-500">
                          Diff vs v{before.version}
                        </summary>
                        {changes.length === 0 ? (
                          <p className="mt-1 text-slate-500">No parameter changes.</p>
                        ) : (
                          <ul className="mt-1 space-y-0.5">
                            {changes.map((change) => (
                              <li key={change} className="font-mono text-[0.7rem]">
                                {change}
                              </li>
                            ))}
                          </ul>
                        )}
                      </details>
                    );
                  })()}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                  {formatDate(rulePack.approvedAt)}
                </td>
                <td className="px-4 py-3">
                  <RulePackActions rulePack={rulePack} />
                </td>
              </tr>
            ))}
            {rulePacks.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                  No rule packs yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
