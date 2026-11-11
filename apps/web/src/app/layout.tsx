import type { Metadata } from 'next';
import type { ReactElement, ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Takeoff Estimator',
    template: '%s · Takeoff Estimator',
  },
  description:
    'Upload architectural drawings and receive a traceable Excel bill of quantities and annotated PDF.',
};

export default function RootLayout({ children }: { children: ReactNode }): ReactElement {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
