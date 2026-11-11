import { model, Schema, type Document } from 'mongoose';

export const USER_ROLES = ['customer', 'reviewer', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export interface UserAttrs {
  email: string;
  passwordHash: string;
  name: string;
  company?: string;
  role: UserRole;
  isActive: boolean;
  freeTrialUsedAt?: Date;
  lastLoginAt?: Date;
  failedLoginCount?: number;
  lockedUntil?: Date | undefined;
  createdAt?: Date;
  updatedAt?: Date;
}

const UserSchema = new Schema<UserAttrs & Document>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    company: { type: String, trim: true },
    role: { type: String, enum: USER_ROLES, default: 'customer' },
    isActive: { type: Boolean, default: true },
    freeTrialUsedAt: { type: Date },
    lastLoginAt: { type: Date },
    failedLoginCount: { type: Number, default: 0 },
    lockedUntil: { type: Date },
  },
  { timestamps: true },
);

export const User = model<UserAttrs & Document>('User', UserSchema);

export interface AuthTokenAttrs {
  userId: string;
  type: 'session' | 'password_reset';
  tokenHash: string;
  expiresAt: Date;
  revokedAt?: Date;
  usedAt?: Date;
  userAgent?: string;
  ip?: string;
}

const AuthTokenSchema = new Schema<AuthTokenAttrs & Document>(
  {
    userId: { type: String, required: true },
    type: { type: String, required: true, enum: ['session', 'password_reset'] },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date },
    usedAt: { type: Date },
    userAgent: { type: String },
    ip: { type: String },
  },
  { timestamps: true },
);

export const AuthToken = model<AuthTokenAttrs & Document>('AuthToken', AuthTokenSchema);
