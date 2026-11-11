import { z } from 'zod';

export const regionPackCodeSchema = z.enum(['US', 'EU', 'APAC', 'OTHER']);
export const tierSchema = z.enum(['standard', 'express']);

export const locationSchema = z
  .object({
    country: z.string().trim().min(2).max(64).optional(),
    region: z.string().trim().max(64).optional(),
  })
  .strict()
  .refine((value) => value.country !== undefined || value.region !== undefined, {
    message: 'At least one location field is required',
  });

export const createProjectBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    regionPackCode: regionPackCodeSchema.optional(),
    tier: tierSchema.optional(),
    location: locationSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.name !== undefined ||
      value.regionPackCode !== undefined ||
      value.tier !== undefined ||
      value.location !== undefined,
    { message: 'At least one field is required' },
  );

export const updateProjectBodySchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    regionPackCode: regionPackCodeSchema.optional(),
    tier: tierSchema.optional(),
    location: locationSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.name !== undefined ||
      value.regionPackCode !== undefined ||
      value.tier !== undefined ||
      value.location !== undefined,
    { message: 'At least one field is required' },
  );

export const createUploadBodySchema = z
  .object({
    originalName: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .refine((value) => !value.includes('/') && !value.includes('\\') && !value.includes('..'), {
        message: 'originalName must not contain path segments',
      }),
    contentType: z.string().trim().min(3).max(128),
    sizeBytes: z.coerce.number().int().positive(),
  })
  .strict();

export const UPLOAD_CONTENT_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/tiff',
  'image/webp',
] as const;

export const updateSheetBodySchema = z
  .object({
    inclusion: z.enum(['included', 'excluded']).optional(),
    exclusionReason: z.string().trim().min(1).max(200).optional(),
    scale: z
      .object({
        // Human notation: 1:N. Stored as the dimensionless real/paper ratio N.
        denominator: z.coerce.number().finite().positive().max(1_000_000),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((value) => value.inclusion !== undefined || value.scale !== undefined, {
    message: 'At least one field is required',
  });

export type CreateProjectInput = z.infer<typeof createProjectBodySchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectBodySchema>;
export type CreateUploadInput = z.infer<typeof createUploadBodySchema>;
export type UpdateSheetInput = z.infer<typeof updateSheetBodySchema>;
