import { z } from 'zod';

export const errorCodes = [
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'ENTITLEMENT_EXCEEDED',
  'RATE_LIMITED',
  'DELIVERY_COMPILE_FAILED',
  'INTERNAL',
] as const;

export type ErrorCode = (typeof errorCodes)[number];

export interface ErrorDetail {
  path?: string;
  issue?: string;
}

export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.enum(errorCodes),
    message: z.string().min(1),
    details: z
      .array(z.object({ path: z.string().optional(), issue: z.string().optional() }))
      .optional(),
    requestId: z.string().optional(),
  }),
});

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
export type ErrorEnvelopeBody = z.infer<typeof errorEnvelopeSchema>['error'];
