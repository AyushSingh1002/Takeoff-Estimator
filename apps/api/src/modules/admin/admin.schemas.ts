import { z } from 'zod';
import { JOB_STATUSES, JOB_SLA_STATUSES } from '../jobs/takeoffJob.model';
import { PROJECT_STATUSES } from '../projects/project.model';
import { USER_ROLES } from '../auth/auth.model';
import { RULE_PACK_STATUSES, RULE_PACK_TRADES } from './rulePack.model';

const limitSchema = z.coerce.number().int().min(1).max(200).default(50);
const offsetSchema = z.coerce.number().int().min(0).default(0);

export const adminUserListQuerySchema = z
  .object({
    q: z.string().trim().max(120).optional(),
    role: z.enum(USER_ROLES).optional(),
    isActive: z.enum(['true', 'false']).optional(),
    limit: limitSchema,
    offset: offsetSchema,
  })
  .strict();

export const updateUserBodySchema = z
  .object({
    role: z.enum(USER_ROLES).optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((value) => value.role !== undefined || value.isActive !== undefined, {
    message: 'At least one field is required',
  });

export const adminProjectListQuerySchema = z
  .object({
    status: z.enum(PROJECT_STATUSES).optional(),
    ownerId: z.string().trim().min(1).max(128).optional(),
    limit: limitSchema,
    offset: offsetSchema,
  })
  .strict();

export const adminJobListQuerySchema = z
  .object({
    status: z.enum(JOB_STATUSES).optional(),
    slaStatus: z.enum(JOB_SLA_STATUSES).optional(),
    reviewerId: z.string().trim().min(1).max(128).optional(),
    limit: limitSchema,
    offset: offsetSchema,
  })
  .strict();

export const assignJobBodySchema = z
  .object({
    reviewerId: z.string().trim().min(1).max(128),
  })
  .strict();

export const auditLogQuerySchema = z
  .object({
    action: z.string().trim().min(1).max(120).optional(),
    actorId: z.string().trim().min(1).max(128).optional(),
    entityType: z.string().trim().min(1).max(120).optional(),
    projectId: z.string().trim().min(1).max(128).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    limit: z.coerce.number().int().min(1).max(500).default(100),
  })
  .strict();

export const rulePackListQuerySchema = z
  .object({
    trade: z.enum(RULE_PACK_TRADES).optional(),
    status: z.enum(RULE_PACK_STATUSES).optional(),
    regionPackCode: z.string().trim().min(1).max(64).optional(),
  })
  .strict();

const numericParameter = z.number().finite().nonnegative();

export const drywallRulePackParametersSchema = z
  .object({
    sheetAreaM2: numericParameter.optional(),
    breakageFactor: numericParameter.optional(),
    screwsPerSheet: numericParameter.optional(),
    jointCompoundPerAreaKg: numericParameter.optional(),
    tapePerAreaM: numericParameter.optional(),
    deductionThresholdM2: numericParameter.optional(),
  })
  .strict();

export const concreteRulePackParametersSchema = z
  .object({
    wasteFactor: numericParameter.optional(),
    lapFactor: numericParameter.optional(),
    meshLapFactor: numericParameter.optional(),
  })
  .strict();

export const rulePackCreateBodySchema = z
  .object({
    trade: z.enum(RULE_PACK_TRADES),
    regionPackCode: z.string().trim().min(1).max(64),
    version: z
      .string()
      .trim()
      .regex(/^\d+\.\d+\.\d+$/, 'Version must be semver (x.y.z)'),
    parameters: z.record(z.number().finite().nonnegative()),
    unitsDisplay: z.string().trim().max(200).optional(),
    engineVersionRange: z.string().trim().max(120).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const schema =
      value.trade === 'drywall'
        ? drywallRulePackParametersSchema
        : concreteRulePackParametersSchema;
    const parsed = schema.safeParse(value.parameters);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        context.addIssue({
          code: 'custom',
          path: ['parameters', ...issue.path],
          message: issue.message,
        });
      }
    }
  });

export type AdminUserListQuery = z.infer<typeof adminUserListQuerySchema>;
export type UpdateUserInput = z.infer<typeof updateUserBodySchema>;
export type AdminProjectListQuery = z.infer<typeof adminProjectListQuerySchema>;
export type AdminJobListQuery = z.infer<typeof adminJobListQuerySchema>;
export type AssignJobInput = z.infer<typeof assignJobBodySchema>;
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;
export type RulePackListQuery = z.infer<typeof rulePackListQuerySchema>;
export type RulePackCreateInput = z.infer<typeof rulePackCreateBodySchema>;
