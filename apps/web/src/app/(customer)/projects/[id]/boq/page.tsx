import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactElement } from 'react';
import { DeliverablesPanel } from '../../../../../components/deliverables-panel';
import { formatDateTime, formatQuantity, titleCase } from '../../../../../lib/format';
import { ServerApiError, serverApi } from '../../../../../lib/server-api';
import type { BoqItem, Deliverable, Project, TakeoffJob } from '../../../../../lib/types';

export const metadata: Metadata = { title: 'Bill of quantities' };

interface Loaded<T> {
  ok: true;
  data: T;
}

interface LoadFailed {
  ok: false;
  message: string;
}

async function load<T>(path: string): Promise<Loaded<T> | LoadFailed> {
  try {
    return { ok: true, data: await serverApi<T>(path) };
  } catch (error: unknown) {
    if (error instanceof ServerApiError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }
}

async function loadProject(id: string): Promise<Project> {
  try {
    return (await serverApi<{ project: Project }>(`/projects/${id}`)).project;
  } catch (error: unknown) {
    if (error instanceof ServerApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }
}

function ReviewBadge({ status }: { status: string }): ReactElement {
  const tone =
    status === 'accepted'
      ? 'bg-green-50 text-green-800 ring-green-200'
      : status === 'rejected'
        ? 'bg-red-50 text-red-800 ring-red-200'
        : status === 'corrected'
          ? 'bg-amber-50 text-amber-900 ring-amber-200'
          : 'bg-slate-100 text-slate-700 ring-slate-200';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tone}`}
    >
      {titleCase(status)}
    </span>
  );
}

export default async function BoqPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<ReactElement> {
  const { id } = await params;
  const project = await loadProject(id);

  let boqItems: BoqItem[] = [];
  let notReady: string | undefined;
  try {
    boqItems = (await serverApi<{ boqItems: BoqItem[] }>(`/projects/${id}/boq`)).boqItems;
  } catch (error: unknown) {
    if (error instanceof ServerApiError && error.status === 409) {
      notReady = error.message;
    } else if (error instanceof ServerApiError && error.status === 404) {
      notFound();
    } else {
      throw error;
    }
  }

  const [statusResult, deliverablesResult] = await Promise.all([
    load<{ job: TakeoffJob }>(`/projects/${id}/status`),
    load<{ deliverables: Deliverable[] }>(`/projects/${id}/deliverables`),
  ]);

  const job = statusResult.ok ? statusResult.data.job : undefined;
  const isTestData = job?.isTestData === true;
  const groups = new Map<string, BoqItem[]>();
  for (const item of boqItems) {
    const list = groups.get(item.trade) ?? [];
    list.push(item);
    groups.set(item.trade, list);
  }
  const trades = [...groups.keys()].sort((a, b) => a.localeCompare(b));

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/projects/${id}`} className="text-sm text-slate-600 hover:text-brand-700">
          ← {project.name}
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Bill of quantities</h1>
            <p className="mt-1 font-mono text-xs text-slate-500">
              {project.reference}
              {job?.sla.deliveredAt === undefined
                ? ''
                : ` · delivered ${formatDateTime(job.sla.deliveredAt)}`}
            </p>
          </div>
          <Link
            href={`/projects/${id}`}
            className="text-sm font-medium text-brand-700 hover:underline"
          >
            Open drawings
          </Link>
        </div>
      </div>

      {isTestData ? (
        <p className="rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
          Test data — this takeoff came from the fixture provider. Do not use these quantities as a
          final bill of quantities.
        </p>
      ) : null}

      {notReady !== undefined ? (
        <div className="rounded-card border border-slate-200 bg-white p-8 text-center">
          <h2 className="text-sm font-semibold text-slate-900">Not ready yet</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">
            {notReady}. The bill of quantities appears after quality review and delivery.
          </p>
          <Link
            href={`/projects/${id}`}
            className="mt-4 inline-block rounded-card bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Back to project
          </Link>
        </div>
      ) : boqItems.length === 0 ? (
        <div className="rounded-card border border-dashed border-slate-300 bg-white p-8 text-center">
          <h2 className="text-sm font-semibold text-slate-900">No bill items</h2>
          <p className="mt-1 text-sm text-slate-600">
            The delivered takeoff does not contain any bill items.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {trades.map((trade) => (
            <section key={trade} aria-labelledby={`trade-${trade}`} className="space-y-2">
              <h2 id={`trade-${trade}`} className="text-lg font-semibold tracking-tight">
                {titleCase(trade)}
              </h2>
              <div className="overflow-x-auto rounded-card border border-slate-200 bg-white">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-medium">
                        Code
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium">
                        Description
                      </th>
                      <th scope="col" className="px-4 py-3 text-right font-medium">
                        Quantity
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium">
                        Unit
                      </th>
                      <th scope="col" className="px-4 py-3 text-right font-medium">
                        Waste
                      </th>
                      <th scope="col" className="px-4 py-3 text-right font-medium">
                        Net quantity
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium">
                        Review
                      </th>
                      <th scope="col" className="px-4 py-3 font-medium">
                        Assumptions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(groups.get(trade) ?? [])
                      .slice()
                      .sort((a, b) => a.code.localeCompare(b.code))
                      .map((item) => (
                        <tr key={item._id} className="align-top">
                          <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-600">
                            {item.code}
                          </td>
                          <td className="px-4 py-3 text-slate-900">{item.description}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums">
                            {formatQuantity(item.quantity)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                            {item.unit}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-600">
                            {formatQuantity(item.wasteFactor * 100)}%
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums">
                            {formatQuantity(item.adjustedQuantity)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <ReviewBadge status={item.reviewStatus} />
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600">
                            {item.assumptions.length === 0 ? '—' : item.assumptions.join('; ')}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}

      {deliverablesResult.ok ? (
        <DeliverablesPanel
          deliverables={deliverablesResult.data.deliverables}
          projectReference={project.reference}
        />
      ) : null}
    </div>
  );
}
