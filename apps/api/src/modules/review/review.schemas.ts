import { z } from 'zod';

export const reviewerMeasurementTypeSchema = z.enum(['length', 'area', 'volume', 'count']);
export const reviewerMeasurementUnitSchema = z.enum(['m', 'm2', 'm3', 'count']);

export const measurementGeometrySchema = z
  .object({
    kind: z.enum(['Point', 'LineString', 'Polygon']),
    coordinates: z.array(z.array(z.number().finite()).min(1)).min(1).max(10_000),
  })
  .strict();

export const updateMeasurementBodySchema = z
  .object({
    value: z.number().positive().finite().optional(),
    geometry: measurementGeometrySchema.optional(),
    note: z.string().trim().min(1).max(500),
  })
  .strict()
  .refine((body) => body.value !== undefined || body.geometry !== undefined, {
    message: 'A value or geometry change is required',
  });

export const addManualMeasurementBodySchema = z
  .object({
    type: reviewerMeasurementTypeSchema,
    value: z.number().positive().finite(),
    unit: reviewerMeasurementUnitSchema,
    note: z.string().trim().min(1).max(500),
  })
  .strict();

export const resolveDiscrepancyBodySchema = z
  .object({
    decision: z.enum(['resolve', 'dismiss']),
    note: z.string().trim().min(1).max(1000),
  })
  .strict();

export const reviewBoqBodySchema = z
  .object({
    decision: z.enum(['accept', 'override']),
    value: z.number().positive().finite().optional(),
    reason: z.string().trim().min(1).max(1000).optional(),
  })
  .strict()
  .refine(
    (body) => body.decision === 'accept' || (body.value !== undefined && body.reason !== undefined),
    {
      message: 'Override requires value and reason',
    },
  );

export const rejectJobBodySchema = z
  .object({
    reason: z.string().trim().min(1).max(1000),
  })
  .strict();

export const assignJobBodySchema = z
  .object({
    reviewerId: z.string().trim().min(1).max(128),
  })
  .strict();

export type UpdateMeasurementInput = z.infer<typeof updateMeasurementBodySchema>;
export type AddManualMeasurementInput = z.infer<typeof addManualMeasurementBodySchema>;
export type ResolveDiscrepancyInput = z.infer<typeof resolveDiscrepancyBodySchema>;
export type ReviewBoqInput = z.infer<typeof reviewBoqBodySchema>;
export type RejectJobInput = z.infer<typeof rejectJobBodySchema>;
export type AssignJobInput = z.infer<typeof assignJobBodySchema>;
