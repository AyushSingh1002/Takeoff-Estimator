'use client';

import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { slaCountdown, type SlaTone } from '../../../lib/format';

const TONE_CLASSES: Record<SlaTone, string> = {
  overdue: 'text-red-700',
  due_soon: 'text-amber-800',
  on_track: 'text-slate-700',
  unknown: 'text-slate-500',
};

export function SlaCountdown({
  deadlineAt,
  initialLabel,
  initialTone,
}: {
  deadlineAt: string | undefined;
  initialLabel: string;
  initialTone: SlaTone;
}): ReactElement {
  const [countdown, setCountdown] = useState({ label: initialLabel, tone: initialTone });

  useEffect(() => {
    function update(): void {
      setCountdown(slaCountdown(deadlineAt));
    }
    update();
    const timer = window.setInterval(update, 30_000);
    return () => {
      window.clearInterval(timer);
    };
  }, [deadlineAt]);

  return (
    <span className={`font-medium tabular-nums ${TONE_CLASSES[countdown.tone]}`}>
      {countdown.label}
    </span>
  );
}
