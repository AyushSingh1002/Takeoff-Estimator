import { z } from 'zod';

const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  'password12',
  'password123',
  'p@ssw0rd',
  'p@ssword',
  'passw0rd',
  '123456',
  '12345678',
  '123456789',
  '1234567890',
  'qwerty',
  'qwerty123',
  'abc123',
  '111111',
  '000000',
  'letmein',
  'welcome',
  'welcome1',
  'admin',
  'administrator',
  'iloveyou',
  'monkey',
  'dragon',
  'sunshine',
  'princess',
  'football',
  'baseball',
  'superman',
  'trustno1',
  'whatever',
  'summer2024',
  'winter2024',
  'test1234',
  '1q2w3e4r',
]);

export const emailSchema = z.string().trim().toLowerCase().email().max(254);

export const passwordSchema = z
  .string()
  .min(12)
  .max(128)
  .refine((value) => !COMMON_PASSWORDS.has(value.toLowerCase()), {
    message: 'Password is too common',
  });

export const nameSchema = z.string().trim().min(1).max(120);

export const companySchema = z.string().trim().max(120);

export const registerBodySchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    name: nameSchema,
    company: companySchema.optional(),
  })
  .strict();

export const loginBodySchema = z.object({ email: emailSchema, password: passwordSchema }).strict();

export const forgotPasswordBodySchema = z.object({ email: emailSchema }).strict();

export const resetPasswordBodySchema = z
  .object({
    token: z.string().min(32).max(256),
    password: passwordSchema,
  })
  .strict();

export const changePasswordBodySchema = z
  .object({
    currentPassword: passwordSchema,
    newPassword: passwordSchema,
  })
  .strict();

export const updateProfileBodySchema = z
  .object({
    name: nameSchema.optional(),
    company: companySchema.optional(),
  })
  .strict()
  .refine((value) => value.name !== undefined || value.company !== undefined, {
    message: 'At least one field is required',
  });

export type RegisterInput = z.infer<typeof registerBodySchema>;
export type LoginInput = z.infer<typeof loginBodySchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordBodySchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordBodySchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileBodySchema>;
