import Link from 'next/link';
import type { ReactElement } from 'react';

const STEPS = [
  {
    title: 'Upload the drawing set',
    body: 'PDF, TIFF, JPEG, PNG or WebP. Files stay private and every download is authorised.',
  },
  {
    title: 'We inspect every sheet',
    body: 'Page count, readability, discipline and scale are checked. A missing scale is flagged before you submit.',
  },
  {
    title: 'Review the intake, then submit',
    body: 'You see the price, included sheets and target turnaround before anything is counted against your plan.',
  },
  {
    title: 'Download the Excel BOQ and annotated PDF',
    body: 'Each line traces back to a drawing location, and a human reviews the result before delivery.',
  },
];

export default function Home(): ReactElement {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-200">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <span className="text-sm font-semibold tracking-tight">Takeoff Estimator</span>
          <nav aria-label="Account" className="flex items-center gap-3 text-sm">
            <Link href="/login" className="text-slate-700 hover:text-brand-700">
              Sign in
            </Link>
            <Link
              href="/register"
              className="rounded-card bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700"
            >
              Create account
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">
            Architectural takeoff
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
            Measurements you can trace, in a workbook your team can price.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-slate-600">
            AI proposes, rules convert, humans verify. Upload an architectural drawing set and
            receive an Excel bill of quantities plus an annotated PDF where every line points back
            to its drawing location.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/register"
              className="rounded-card bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
            >
              Start a takeoff
            </Link>
            <Link
              href="/login"
              className="rounded-card border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-900 hover:bg-slate-50"
            >
              Sign in
            </Link>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Target turnaround is confirmed before submission. Accuracy and SLA claims are published
            only when measured results support them.
          </p>
        </section>

        <section aria-labelledby="how-it-works" className="border-t border-slate-200 bg-slate-50">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 id="how-it-works" className="text-lg font-semibold text-slate-900">
              How it works
            </h2>
            <ol className="mt-8 grid gap-6 sm:grid-cols-2">
              {STEPS.map((step, index) => (
                <li key={step.title} className="rounded-card border border-slate-200 bg-white p-5">
                  <p className="font-mono text-xs text-brand-700">0{index + 1}</p>
                  <h3 className="mt-2 text-sm font-semibold text-slate-900">{step.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200">
        <div className="mx-auto max-w-6xl px-4 py-6 text-xs text-slate-500 sm:px-6">
          Drawings and BOQs are confidential customer documents.
        </div>
      </footer>
    </div>
  );
}
