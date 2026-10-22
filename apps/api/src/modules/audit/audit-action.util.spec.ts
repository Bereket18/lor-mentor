import {
  auditLabelForAction,
  describeAuditEvent,
  humanizeEntityType,
  isAdminRole,
} from './audit-action.util';

describe('audit action descriptors', () => {
  it('recognises admin roles only', () => {
    expect(isAdminRole('ADMIN')).toBe(true);
    expect(isAdminRole('SUPER_ADMIN')).toBe(true);
    expect(isAdminRole('TEACHER')).toBe(false);
    expect(isAdminRole(null)).toBe(false);
  });

  it('describes a user role change', () => {
    expect(describeAuditEvent('Users', 'changeRole')).toEqual({
      action: 'users.changeRole',
      label: 'Changed user role',
      entityType: 'User',
      category: 'Users',
    });
  });

  it('maps shared bank handlers to a bank entity', () => {
    expect(describeAuditEvent('Payments', 'setBankAccount')).toMatchObject({
      action: 'payments.setBankAccount',
      label: 'Updated bank account',
      entityType: 'PaymentBank',
      category: 'Billing',
    });
  });

  it('maps forum moderation handlers to the right content type', () => {
    expect(describeAuditEvent('Forum', 'removePost')).toMatchObject({
      action: 'forum.removePost',
      label: 'Deleted forum post',
      entityType: 'ForumPost',
      category: 'Moderation',
    });
    expect(describeAuditEvent('Forum', 'resolveReport')).toMatchObject({
      label: 'Resolved forum report',
      entityType: 'ForumReport',
    });
  });

  it('humanizes legacy and new action keys', () => {
    expect(auditLabelForAction('PAYMENT_APPROVED')).toBe('Payment approved');
    expect(auditLabelForAction('AUTH_LOGIN_FAILED')).toBe('Login failed');
    expect(auditLabelForAction('users.changeRole')).toBe('Changed user role');
    expect(auditLabelForAction('SOMETHING_NEW')).toBe('Something new');
    expect(humanizeEntityType('AcademicYear')).toBe('Academic year');
  });
});
