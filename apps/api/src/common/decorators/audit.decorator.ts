import { SetMetadata } from '@nestjs/common';

export const AUDIT_ADMIN_KEY = 'audit:admin';
export const SKIP_AUDIT_KEY = 'audit:skip';

export interface AuditAdminOptions {
  /**
   * Audit a read-only endpoint as an admin action, e.g. an admin viewing a
   * student's uploaded payment receipt.
   */
  read?: boolean;
}

/**
 * Force an endpoint to be included in the admin audit trail when the caller is
 * an ADMIN or SUPER_ADMIN. Normally the interceptor only audits routes that
 * explicitly require an admin role; this is for shared routes (for example,
 * forum moderation endpoints) where an admin action should still be recorded.
 */
export const AuditAdmin = (options: AuditAdminOptions = {}) =>
  SetMetadata(AUDIT_ADMIN_KEY, options);

/**
 * Skip the automatic audit entry for a handler that already writes its own,
 * richer audit record (for example payment approval/reversal).
 */
export const SkipAudit = () => SetMetadata(SKIP_AUDIT_KEY, true);
