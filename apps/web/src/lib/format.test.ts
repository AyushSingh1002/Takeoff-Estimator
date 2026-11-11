import { describe, expect, it } from 'vitest';
import {
  benchmarkSourceLabel,
  claimStatusLabel,
  customerProgressLabel,
  deliverableLabel,
  fileStatusLabel,
  formatBytes,
  formatDate,
  formatDateTime,
  formatDuration,
  formatMoney,
  formatQuantity,
  isJobActive,
  isProcessingStatus,
  pricingPlanLabel,
  progressStepIndex,
  projectStatusLabel,
  reviewStatusLabel,
  roleLabel,
  rulePackParameterSummary,
  rulePackStatusLabel,
  sheetScaleLabel,
  slaCountdown,
  slaStatusLabel,
  titleCase,
} from './format';
import { ApiError, fieldError, humanizeIssue } from './api';

describe('customer-facing labels', () => {
  it('maps internal job statuses to customer language', () => {
    expect(customerProgressLabel('queued')).toBe('Processing drawings');
    expect(customerProgressLabel('in_review')).toBe('Quality review');
    expect(customerProgressLabel('review_rejected')).toBe('Quality review');
    expect(customerProgressLabel('delivering' as string)).toBe('delivering');
    expect(customerProgressLabel(undefined)).toBe('Not submitted');
  });

  it('maps project and file statuses and keeps unknown values visible', () => {
    expect(projectStatusLabel('draft')).toBe('Draft');
    expect(projectStatusLabel('in_progress')).toBe('In progress');
    expect(fileStatusLabel('ingesting')).toBe('Inspecting');
    expect(fileStatusLabel('quarantined')).toBe('quarantined');
    expect(isProcessingStatus('ingesting')).toBe(true);
    expect(isProcessingStatus('ingested')).toBe(false);
  });
});

describe('formatters', () => {
  it('formats bytes with unit-aware precision', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(26_214_400)).toBe('25.0 MB');
  });

  it('formats ISO dates and rejects invalid ones', () => {
    expect(formatDate('2026-11-09T10:00:00.000Z')).toBe('09 Nov 2026');
    expect(formatDate('not-a-date')).toBe('—');
    expect(formatDate(undefined)).toBe('—');
    expect(formatDateTime('2026-11-09T10:00:00.000Z')).toContain('09 Nov 2026');
    expect(formatDateTime(undefined)).toBe('—');
  });

  it('formats money from minor units and quantities with tabular precision', () => {
    expect(formatMoney(25000, 'USD')).toBe('$250.00');
    expect(formatMoney(0, 'USD')).toBe('$0.00');
    expect(formatMoney(Number.NaN, 'USD')).toBe('—');
    expect(formatQuantity(12.345)).toBe('12.35');
    expect(formatQuantity(Number.NaN)).toBe('—');
  });
});

describe('intake and status presentation', () => {
  it('maps progress stages to the four customer steps', () => {
    expect(progressStepIndex('processing')).toBe(0);
    expect(progressStepIndex('review')).toBe(1);
    expect(progressStepIndex('preparing')).toBe(2);
    expect(progressStepIndex('ready')).toBe(3);
    expect(progressStepIndex('delayed')).toBe(-1);
    expect(progressStepIndex(undefined)).toBe(-1);
    expect(isJobActive('in_review')).toBe(true);
    expect(isJobActive('delivered')).toBe(false);
  });

  it('shows a scale label or a readable fallback', () => {
    expect(sheetScaleLabel({ status: 'detected', label: '1:100' })).toBe('1:100');
    expect(sheetScaleLabel({ status: 'missing' })).toBe('Scale missing');
    expect(sheetScaleLabel({ status: 'user_provided' })).toBe('Set by you');
  });

  it('humanises codes and deliverable types', () => {
    expect(titleCase('floor_plan')).toBe('Floor Plan');
    expect(deliverableLabel('boq_xlsx')).toBe('Excel bill of quantities');
    expect(deliverableLabel('annotated_pdf')).toBe('Annotated drawing PDF');
    expect(deliverableLabel('other')).toBe('other');
  });
});

describe('reviewer workstation presentation', () => {
  it('maps internal review statuses for the queue', () => {
    expect(reviewStatusLabel('awaiting_review')).toBe('Awaiting review');
    expect(reviewStatusLabel('review_rejected')).toBe('Rejected — returns to admin');
    expect(reviewStatusLabel('custom_state')).toBe('Custom State');
  });

  it('formats countdowns and flags overdue or due-soon work', () => {
    const now = Date.parse('2026-11-10T12:00:00.000Z');
    expect(formatDuration(90 * 60_000)).toBe('1h 30m');
    expect(formatDuration(26 * 60 * 60_000)).toBe('1d 2h');
    expect(slaCountdown('2026-11-10T13:00:00.000Z', now)).toEqual({
      label: '1h 0m remaining',
      tone: 'due_soon',
    });
    expect(slaCountdown('2026-11-11T12:00:00.000Z', now).tone).toBe('on_track');
    expect(slaCountdown('2026-11-10T11:00:00.000Z', now)).toEqual({
      label: 'Overdue by 1h 0m',
      tone: 'overdue',
    });
    expect(slaCountdown(undefined, now)).toEqual({ label: 'No deadline', tone: 'unknown' });
    expect(slaCountdown('not-a-date', now).tone).toBe('unknown');
  });
});

describe('admin presentation', () => {
  it('maps administrative statuses, roles and plans', () => {
    expect(slaStatusLabel('at_risk')).toBe('At risk');
    expect(slaStatusLabel('breached')).toBe('Breached');
    expect(slaStatusLabel(undefined)).toBe('—');
    expect(slaStatusLabel('custom')).toBe('Custom');
    expect(roleLabel('admin')).toBe('Administrator');
    expect(roleLabel('auditor')).toBe('Auditor');
    expect(pricingPlanLabel('per_takeoff')).toBe('Per takeoff');
    expect(pricingPlanLabel('express_addon')).toBe('Express add-on');
    expect(pricingPlanLabel('custom_plan')).toBe('Custom Plan');
    expect(claimStatusLabel('retakeoff_in_progress')).toBe('Re-takeoff in progress');
    expect(claimStatusLabel('submitted')).toBe('Submitted');
    expect(benchmarkSourceLabel('licensed_estimator')).toBe('Licensed estimator');
    expect(rulePackStatusLabel('approved')).toBe('Approved');
  });

  it('summarises rule pack parameters with readable keys and quantities', () => {
    expect(rulePackParameterSummary({})).toBe('—');
    expect(rulePackParameterSummary({ sheetAreaM2: 2.88, screwsPerSheet: 32 })).toBe(
      'Sheet Area M2 2.88 · Screws Per Sheet 32',
    );
  });
});

describe('API error presentation', () => {
  it('extracts the field issue and never exposes internals', () => {
    const error = new ApiError(400, 'VALIDATION_FAILED', 'Validation failed', [
      { path: 'email', issue: 'invalid_string' },
      { path: 'password', issue: 'too_small' },
    ]);
    expect(fieldError(error, 'email')).toBe('Enter a valid value.');
    expect(fieldError(error, 'password')).toBe('This value is too short.');
    expect(fieldError(error, 'name')).toBeUndefined();
    expect(humanizeIssue('custom_rule')).toBe('Check this value and try again.');
  });
});
