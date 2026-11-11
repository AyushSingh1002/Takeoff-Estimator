import { recordAudit, type AuditLogAttrs } from './audit.model';

export async function writeAudit(entry: Omit<AuditLogAttrs, 'at'> & { at?: Date }): Promise<void> {
  await recordAudit({ at: new Date(), ...entry });
}
