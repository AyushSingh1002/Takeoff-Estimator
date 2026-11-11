import { redirect } from 'next/navigation';
import type { ReactElement } from 'react';

export default function ProjectsPage(): ReactElement {
  redirect('/dashboard');
}
