import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { VerificationPurpose } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { MailService } from '../mail/mail.service';
import { UsersService } from './users.service';
import type { CreateUserDto } from './dto/create-user.dto';

const sendStaffInvitation = jest.fn();
const mail = { sendStaffInvitation } as unknown as MailService;
const config = {
  get: jest.fn((key: string) =>
    key === 'WEB_PUBLIC_URL' ? 'https://app.example.test' : undefined,
  ),
} as unknown as ConfigService;

/**
 * Regression coverage for audit finding A1: creating a teacher with a program
 * (department) must be able to persist course assignments in the same step, so
 * the teacher's dashboard is populated at first login instead of requiring a
 * second manual assignment on the course page.
 */
describe('UsersService.createUser — teacher course pre-assignment', () => {
  const findUserByEmail = jest.fn();
  const findDepartment = jest.fn();
  const findAcademicYear = jest.fn();
  const findManyCourses = jest.fn();
  const createUser = jest.fn();
  const updateManyCourses = jest.fn();

  const tx = {
    user: { create: createUser },
    course: { updateMany: updateManyCourses },
  };

  const transaction = jest.fn(
    (fn: (client: unknown) => Promise<unknown>): Promise<unknown> => fn(tx),
  );

  const prisma = {
    user: { findUnique: findUserByEmail },
    department: { findUnique: findDepartment },
    academicYear: { findUnique: findAcademicYear },
    course: { findMany: findManyCourses },
    $transaction: transaction,
  } as unknown as PrismaService;

  const service = new UsersService(prisma, mail, config);

  const teacherDto: CreateUserDto = {
    fullName: 'Dr. Test',
    email: 'teacher@example.com',
    role: 'TEACHER',
  };

  const createdUser = {
    id: 'teacher-1',
    email: 'teacher@example.com',
    fullName: 'Dr. Test',
    role: 'TEACHER',
    departmentId: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    findUserByEmail.mockResolvedValue(null);
    createUser.mockResolvedValue(createdUser);
    updateManyCourses.mockResolvedValue({ count: 2 });
    sendStaffInvitation.mockResolvedValue(undefined);
  });

  it('emails a single-use setup link instead of returning a password', async () => {
    await service.createUser('ADMIN', teacherDto);

    const data = (
      createUser.mock.calls[0] as [{ data: Record<string, unknown> }]
    )[0].data;
    const token = data.passwordResetToken as string;
    const expiry = data.passwordResetExpiry as Date;

    expect(token).toMatch(/^[0-9a-f]{64}$/);
    // 48-hour window, with slack for the test's own runtime.
    const hours = (expiry.getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(47);
    expect(hours).toBeLessThanOrEqual(48);

    expect(sendStaffInvitation).toHaveBeenCalledTimes(1);
    const [to, fullName, setupUrl, role] = sendStaffInvitation.mock
      .calls[0] as [string, string, string, string];
    expect(to).toBe(createdUser.email);
    expect(fullName).toBe(createdUser.fullName);
    expect(role).toBe('TEACHER');
    expect(setupUrl).toBe(
      `https://app.example.test/reset-password?token=${token}`,
    );
  });

  it('hands the setup link to the admin when the invitation email cannot be sent', async () => {
    sendStaffInvitation.mockRejectedValue(
      new Error('Email service is not configured right now'),
    );

    const result = await service.createUser('ADMIN', teacherDto);

    const data = (
      createUser.mock.calls[0] as [{ data: Record<string, unknown> }]
    )[0].data;
    const token = data.passwordResetToken as string;

    expect(result.invitationSent).toBe(false);
    expect(result.setupUrl).toBe(
      `https://app.example.test/reset-password?token=${token}`,
    );
    // Still never a password, and never the raw token on its own.
    expect(result).not.toHaveProperty('temporaryPassword');
    expect(result).not.toHaveProperty('password');
    expect(Object.values(result)).not.toContain(token);
  });

  it('assigns the selected courses atomically with the new teacher account', async () => {
    findManyCourses.mockResolvedValue([
      { id: 'course-a', title: 'Anatomy', teacherId: null },
      { id: 'course-b', title: 'Physiology', teacherId: null },
    ]);

    const result = await service.createUser('ADMIN', {
      ...teacherDto,
      courseIds: ['course-a', 'course-b'],
    });

    expect(result.user).toEqual(createdUser);
    // The endpoint used to hand back a plaintext temporary password. It must
    // never do that again: no password ever leaves this method.
    expect(result).not.toHaveProperty('temporaryPassword');
    expect(result).not.toHaveProperty('password');
    expect(result.invitationSent).toBe(true);
    expect(result).not.toHaveProperty('setupUrl');
    expect(transaction).toHaveBeenCalledTimes(1);
    const [{ data: createData }] = createUser.mock.calls[0] as [
      { data: Record<string, unknown> },
    ];
    expect(createData.role).toBe('TEACHER');
    // Reviewer access is never granted automatically; an administrator must
    // grant it explicitly.
    expect(createData.isAnatomyReviewer).toBeUndefined();
    expect(updateManyCourses).toHaveBeenCalledWith({
      where: {
        id: { in: ['course-a', 'course-b'] },
        teacherId: null,
        isArchived: false,
      },
      data: { teacherId: 'teacher-1' },
    });
  });

  it('creates a teacher without touching courses when none are selected', async () => {
    await service.createUser('ADMIN', teacherDto);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(findManyCourses).not.toHaveBeenCalled();
    expect(updateManyCourses).not.toHaveBeenCalled();
  });

  it('rejects courseIds for non-teacher roles before creating anything', async () => {
    await expect(
      service.createUser('SUPER_ADMIN', {
        fullName: 'Admin Two',
        email: 'admin2@example.com',
        role: 'ADMIN',
        courseIds: ['course-a'],
      }),
    ).rejects.toThrow('Courses can only be assigned to teacher accounts');

    expect(findManyCourses).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects the whole request when a selected course is missing or archived', async () => {
    findManyCourses.mockResolvedValue([
      { id: 'course-a', title: 'Anatomy', teacherId: null },
    ]);

    await expect(
      service.createUser('ADMIN', {
        ...teacherDto,
        courseIds: ['course-a', 'course-b'],
      }),
    ).rejects.toThrow('One or more selected courses were not found');

    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects a course that already has a teacher assigned', async () => {
    findManyCourses.mockResolvedValue([
      { id: 'course-a', title: 'Anatomy', teacherId: 'other-teacher' },
    ]);

    await expect(
      service.createUser('ADMIN', { ...teacherDto, courseIds: ['course-a'] }),
    ).rejects.toThrow(
      'Course "Anatomy" already has a teacher assigned. Reassign it from the course page instead.',
    );

    expect(transaction).not.toHaveBeenCalled();
  });

  it('aborts when a course is claimed concurrently (updateMany count mismatch)', async () => {
    findManyCourses.mockResolvedValue([
      { id: 'course-a', title: 'Anatomy', teacherId: null },
      { id: 'course-b', title: 'Physiology', teacherId: null },
    ]);
    updateManyCourses.mockResolvedValue({ count: 1 });

    await expect(
      service.createUser('ADMIN', {
        ...teacherDto,
        courseIds: ['course-a', 'course-b'],
      }),
    ).rejects.toThrow(
      'The selected courses were just assigned to another teacher. Please try again.',
    );

    // The account row was created inside the transaction, but the thrown error
    // makes Prisma roll the whole transaction back — no partial account.
    expect(createUser).toHaveBeenCalledTimes(1);
  });

  it('deduplicates repeated course ids', async () => {
    findManyCourses.mockResolvedValue([
      { id: 'course-a', title: 'Anatomy', teacherId: null },
      { id: 'course-b', title: 'Physiology', teacherId: null },
    ]);

    await service.createUser('ADMIN', {
      ...teacherDto,
      courseIds: ['course-a', 'course-a', 'course-b'],
    });

    expect(findManyCourses).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['course-a', 'course-b'] }, isArchived: false },
      }),
    );
    expect(updateManyCourses).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ['course-a', 'course-b'] },
        }),
      }),
    );
  });

  it('still requires department and academic year for students', async () => {
    await expect(
      service.createUser('ADMIN', {
        fullName: 'Student One',
        email: 'student1@example.com',
        role: 'STUDENT',
      }),
    ).rejects.toThrow('Students require a department and academic year');
  });

  it('still blocks duplicate emails', async () => {
    findUserByEmail.mockResolvedValue({ id: 'existing' });

    await expect(service.createUser('ADMIN', teacherDto)).rejects.toThrow(
      'An account with this email already exists',
    );
    expect(transaction).not.toHaveBeenCalled();
  });

  it('enforces the role hierarchy before any work', async () => {
    await expect(
      service.createUser('ADMIN', {
        fullName: 'Admin Three',
        email: 'admin3@example.com',
        role: 'ADMIN',
      }),
    ).rejects.toMatchObject({
      message: 'You are not allowed to create a user with that role',
    });
  });
});

/**
 * Admin-dashboard audit: account-status and program filters for the users
 * list, and the rule that admin accounts carry no program.
 */
describe('UsersService — user list filters and admin program rules', () => {
  const findUser = jest.fn();
  const updateUser = jest.fn();
  const findManyUsers = jest.fn();
  const countUsers = jest.fn();
  const findDepartment = jest.fn();
  const findAcademicYear = jest.fn();
  const findCourse = jest.fn();
  const updateManyCourses = jest.fn();
  const createAudit = jest.fn();
  const transactionMock = jest.fn();

  const prisma = {
    user: {
      findUnique: findUser,
      findMany: findManyUsers,
      count: countUsers,
      update: updateUser,
    },
    department: { findUnique: findDepartment },
    academicYear: { findUnique: findAcademicYear },
    course: { findMany: findCourse, updateMany: updateManyCourses },
    auditLog: { create: createAudit },
    $transaction: transactionMock,
  } as unknown as PrismaService;

  const service = new UsersService(prisma, mail, config);

  beforeEach(() => {
    jest.clearAllMocks();
    findManyUsers.mockResolvedValue([]);
    countUsers.mockResolvedValue(0);
    createAudit.mockResolvedValue({});
  });

  describe('findAll filters', () => {
    it('applies the account-status filter (login gate, not subscription state)', async () => {
      await service.findAll({
        page: 1,
        limit: 100,
        search: '',
        role: '',
        isActive: 'false',
      });

      expect(findManyUsers).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: false } }),
      );
      expect(countUsers).toHaveBeenCalledWith({ where: { isActive: false } });
    });

    it('filters by program (department) id', async () => {
      await service.findAll({
        page: 1,
        limit: 100,
        search: '',
        role: '',
        departmentId: 'dept-1',
      });

      expect(findManyUsers).toHaveBeenCalledWith(
        expect.objectContaining({ where: { departmentId: 'dept-1' } }),
      );
    });

    it('combines search, role, status and program filters in one where clause', async () => {
      await service.findAll({
        page: 2,
        limit: 25,
        search: 'aisha',
        role: 'TEACHER',
        isActive: 'true',
        departmentId: 'dept-1',
      });

      expect(findManyUsers).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 25,
          take: 25,
          where: {
            OR: [
              { fullName: { contains: 'aisha', mode: 'insensitive' } },
              { email: { contains: 'aisha', mode: 'insensitive' } },
            ],
            role: 'TEACHER',
            isActive: true,
            departmentId: 'dept-1',
          },
        }),
      );
    });

    it('ignores an invalid account-status value', async () => {
      await service.findAll({
        page: 1,
        limit: 100,
        search: '',
        role: '',
        isActive: 'maybe',
      });

      expect(findManyUsers).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });
  });

  describe('assignDepartment program rule', () => {
    it('rejects program assignment for admin accounts', async () => {
      findUser.mockResolvedValue({ role: 'ADMIN' });

      await expect(
        service.assignDepartment('admin-1', 'dept-1', undefined),
      ).rejects.toThrow('Program assignment does not apply to admin accounts');
      expect(updateUser).not.toHaveBeenCalled();
    });

    it('rejects program assignment for super-admin accounts', async () => {
      findUser.mockResolvedValue({ role: 'SUPER_ADMIN' });

      await expect(
        service.assignDepartment('super-1', 'dept-1', undefined),
      ).rejects.toThrow(BadRequestException);
      expect(updateUser).not.toHaveBeenCalled();
    });

    it('still assigns a program to teachers', async () => {
      findUser.mockResolvedValue({ role: 'TEACHER' });
      findDepartment.mockResolvedValue({ id: 'dept-1', isArchived: false });
      updateUser.mockResolvedValue({
        id: 'teacher-1',
        fullName: 'Dr. Test',
        departmentId: 'dept-1',
        academicYearId: null,
        department: { id: 'dept-1', name: 'Nursing' },
        academicYear: null,
      });

      const result = await service.assignDepartment(
        'teacher-1',
        'dept-1',
        undefined,
      );

      expect(result.message).toBe('Program assigned');
      expect(updateUser).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { departmentId: 'dept-1', academicYearId: null },
        }),
      );
    });
  });

  describe('changeRole reviewer flag', () => {
    it('does not grant anatomy review access when a user becomes a teacher', async () => {
      findUser.mockResolvedValue({ role: 'STUDENT' });
      updateUser.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        fullName: 'New Teacher',
        role: 'TEACHER',
        isAnatomyReviewer: false,
      });

      await service.changeRole('user-1', 'TEACHER', 'actor-1', 'SUPER_ADMIN');

      expect(updateUser).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { role: 'TEACHER' },
        }),
      );
    });

    it('does not touch an existing reviewer flag when a teacher leaves the role', async () => {
      findUser.mockResolvedValue({ role: 'TEACHER' });
      updateUser.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        fullName: 'Former Teacher',
        role: 'ADMIN',
        isAnatomyReviewer: true,
      });

      await service.changeRole('user-1', 'ADMIN', 'actor-1', 'SUPER_ADMIN');

      expect(updateUser).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { role: 'ADMIN' },
        }),
      );
    });
  });

  describe('setAnatomyReviewer admin control', () => {
    it('grants reviewer access to a teacher and audits the grant', async () => {
      findUser.mockResolvedValue({
        id: 'teacher-1',
        email: 't1@example.com',
        fullName: 'Dr. One',
        role: 'TEACHER',
        isAnatomyReviewer: false,
      });
      updateUser.mockResolvedValue({
        id: 'teacher-1',
        email: 't1@example.com',
        fullName: 'Dr. One',
        role: 'TEACHER',
        isAnatomyReviewer: true,
      });

      const result = await service.setAnatomyReviewer(
        'teacher-1',
        true,
        'admin-1',
        'ADMIN',
      );

      expect(updateUser).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'teacher-1' },
          data: { isAnatomyReviewer: true },
        }),
      );
      expect(createAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actorId: 'admin-1',
            action: 'ANATOMY_REVIEWER_GRANT',
            entityType: 'User',
            entityId: 'teacher-1',
          }),
        }),
      );
      expect(result.changed).toBe(true);
      expect(result.user.isAnatomyReviewer).toBe(true);
    });

    it('revokes reviewer access from a teacher and audits the revoke', async () => {
      findUser.mockResolvedValue({
        id: 'teacher-2',
        email: 't2@example.com',
        fullName: 'Dr. Two',
        role: 'TEACHER',
        isAnatomyReviewer: true,
      });
      updateUser.mockResolvedValue({
        id: 'teacher-2',
        email: 't2@example.com',
        fullName: 'Dr. Two',
        role: 'TEACHER',
        isAnatomyReviewer: false,
      });

      const result = await service.setAnatomyReviewer(
        'teacher-2',
        false,
        'super-1',
        'SUPER_ADMIN',
      );

      expect(createAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'ANATOMY_REVIEWER_REVOKE',
            entityId: 'teacher-2',
          }),
        }),
      );
      expect(result.message).toBe('Anatomy reviewer access revoked');
      expect(result.user.isAnatomyReviewer).toBe(false);
    });

    it('refuses to change reviewer access for a non-teacher target', async () => {
      findUser.mockResolvedValue({
        id: 'admin-2',
        email: 'a2@example.com',
        fullName: 'Admin Two',
        role: 'ADMIN',
        isAnatomyReviewer: false,
      });

      await expect(
        service.setAnatomyReviewer('admin-2', true, 'admin-1', 'ADMIN'),
      ).rejects.toThrow(
        'Anatomy reviewer access can only be changed for teacher accounts',
      );
      expect(updateUser).not.toHaveBeenCalled();
      expect(createAudit).not.toHaveBeenCalled();
    });

    it('is a no-op when the flag already matches the request', async () => {
      findUser.mockResolvedValue({
        id: 'teacher-3',
        email: 't3@example.com',
        fullName: 'Dr. Three',
        role: 'TEACHER',
        isAnatomyReviewer: true,
      });

      const result = await service.setAnatomyReviewer(
        'teacher-3',
        true,
        'admin-1',
        'ADMIN',
      );

      expect(result.changed).toBe(false);
      expect(updateUser).not.toHaveBeenCalled();
      expect(createAudit).not.toHaveBeenCalled();
    });
  });

  describe('createUser program rule', () => {
    it('rejects creating an admin account with a program attached', async () => {
      findUser.mockResolvedValue(null);

      await expect(
        service.createUser('SUPER_ADMIN', {
          fullName: 'Admin Four',
          email: 'admin4@example.com',
          role: 'ADMIN',
          departmentId: 'dept-1',
        }),
      ).rejects.toThrow('Program assignment does not apply to admin accounts');
    });

    it('still allows a teacher account with a program', async () => {
      findUser.mockResolvedValue(null);
      findDepartment.mockResolvedValue({ id: 'dept-1', isArchived: false });
      const createTxUser = jest
        .fn<Promise<unknown>, [unknown]>()
        .mockResolvedValue({
          id: 'teacher-9',
          email: 't9@example.com',
          fullName: 'Dr. Nine',
          role: 'TEACHER',
          departmentId: 'dept-1',
        });
      transactionMock.mockImplementation(
        (fn: (client: unknown) => Promise<unknown>) =>
          fn({ user: { create: createTxUser }, course: {} }),
      );
      const result = await service.createUser('SUPER_ADMIN', {
        fullName: 'Dr. Nine',
        email: 't9@example.com',
        role: 'TEACHER',
        departmentId: 'dept-1',
      });

      expect(result.user.id).toBe('teacher-9');
      expect(createTxUser).toHaveBeenCalledTimes(1);
      const createArgs = createTxUser.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(createArgs.data).toMatchObject({
        role: 'TEACHER',
        departmentId: 'dept-1',
      });
    });
  });
});

/**
 * Every anti-abuse property of the six-digit code — single use, expiry, the
 * attempt budget, supersession and the issuance cap — is enforced by a
 * condition in the WHERE clause of one statement, never by application
 * arithmetic between two statements. That is what makes them hold when two
 * requests run at once, and it is also why they are worth pinning here: there
 * is no test database in this repo, so what these assert is the exact contract
 * handed to Prisma for the database to enforce.
 */
describe('UsersService — verification code storage guards', () => {
  const findUserByEmail = jest.fn();
  const updateManyCodes = jest.fn();
  const createCode = jest.fn();
  const findFirstCode = jest.fn();
  const countCodes = jest.fn();
  const deleteManyCodes = jest.fn();
  const updateUser = jest.fn();

  const txClient = {
    verificationCode: {
      deleteMany: deleteManyCodes,
      updateMany: updateManyCodes,
    },
  };

  // The service uses both transaction forms: the array form when issuing, and
  // the interactive callback form when restoring a superseded code.
  const transactionImpl = (arg: unknown) =>
    typeof arg === 'function'
      ? (arg as (client: unknown) => Promise<unknown>)(txClient)
      : Promise.all(arg as Array<Promise<unknown>>);
  const transaction = jest.fn(transactionImpl);

  const prisma = {
    user: { findUnique: findUserByEmail, update: updateUser },
    verificationCode: {
      updateMany: updateManyCodes,
      create: createCode,
      findFirst: findFirstCode,
      count: countCodes,
    },
    $transaction: transaction,
  } as unknown as PrismaService;

  const service = new UsersService(prisma, mail, config);

  beforeEach(() => {
    for (const mock of [
      findUserByEmail,
      updateManyCodes,
      createCode,
      findFirstCode,
      countCodes,
      deleteManyCodes,
      updateUser,
      transaction,
    ]) {
      mock.mockReset();
    }
    transaction.mockImplementation(transactionImpl);
    updateManyCodes.mockResolvedValue({ count: 1 });
    deleteManyCodes.mockResolvedValue({ count: 1 });
  });

  type Statement = { where: Record<string, unknown>; data?: Record<string, unknown> };

  function firstCall(mock: jest.Mock): Statement {
    return mock.mock.calls[0][0] as Statement;
  }

  function firstCodeCount(): { where: Record<string, unknown> } {
    return countCodes.mock.calls[0][0] as { where: Record<string, unknown> };
  }

  it('supersedes the active code and inserts the new one in one transaction', async () => {
    createCode.mockResolvedValue({ id: 'code-new' });
    const expiresAt = new Date('2026-11-04T12:15:00.000Z');

    const created = await service.issueVerificationCode({
      userId: 'user-1',
      purpose: VerificationPurpose.EMAIL_VERIFICATION,
      codeHash: '$2b$10$stored-hash',
      expiresAt,
    });

    expect(created).toEqual({ id: 'code-new' });
    // Both halves in one transaction: superseding without inserting would leave
    // the account with no usable code, and inserting without superseding would
    // leave two codes valid at once.
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transaction.mock.calls[0][0]).toHaveLength(2);

    const supersede = firstCall(updateManyCodes);
    expect(supersede.where).toEqual({
      userId: 'user-1',
      purpose: VerificationPurpose.EMAIL_VERIFICATION,
      consumedAt: null,
      supersededAt: null,
    });
    expect(supersede.data?.supersededAt).toBeInstanceOf(Date);

    expect(createCode).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        purpose: VerificationPurpose.EMAIL_VERIFICATION,
        codeHash: '$2b$10$stored-hash',
        expiresAt,
      },
    });
  });

  it('issues codes under the requested purpose and no other', async () => {
    createCode.mockResolvedValue({ id: 'code-new' });

    await service.issueVerificationCode({
      userId: 'user-1',
      purpose: VerificationPurpose.PASSWORD_RESET,
      codeHash: '$2b$10$stored-hash',
      expiresAt: new Date(),
    });

    const supersede = firstCall(updateManyCodes);
    const create = firstCall(createCode);
    // Purpose is part of both the supersede filter and the insert, so a code
    // issued for one purpose can never be redeemed for the other.
    expect(supersede.where.purpose).toBe(VerificationPurpose.PASSWORD_RESET);
    expect(create.data?.purpose).toBe(VerificationPurpose.PASSWORD_RESET);
  });

  it('selects only live codes: unexpired, unused, unsuperseded, under budget', async () => {
    findFirstCode.mockResolvedValue({ id: 'code-1' });

    await service.findActiveVerificationCode({
      userId: 'user-1',
      purpose: VerificationPurpose.EMAIL_VERIFICATION,
      maxAttempts: 5,
    });

    const { where, orderBy } = findFirstCode.mock.calls[0][0] as {
      where: Record<string, unknown>;
      orderBy: unknown;
    };

    expect(where).toMatchObject({
      userId: 'user-1',
      purpose: VerificationPurpose.EMAIL_VERIFICATION,
      consumedAt: null,
      supersededAt: null,
      attempts: { lt: 5 },
    });
    // Every one of those four conditions has to be here rather than checked
    // afterwards: an expired, used, superseded or burned code has to match
    // "nothing to compare against".
    expect((where.expiresAt as { gt: unknown }).gt).toBeInstanceOf(Date);
    expect(orderBy).toEqual({ createdAt: 'desc' });
  });

  it('claims a code with the whole guard in the update itself', async () => {
    updateManyCodes.mockResolvedValue({ count: 1 });

    await expect(
      service.claimVerificationCode({
        id: 'code-1',
        codeHash: '$2b$10$stored-hash',
        maxAttempts: 5,
      }),
    ).resolves.toBe(true);

    const { where, data } = firstCall(updateManyCodes);
    // The hash is part of the match, so a row replaced between the caller's read
    // and this write cannot be consumed by that stale read.
    expect(where).toMatchObject({
      id: 'code-1',
      codeHash: '$2b$10$stored-hash',
      consumedAt: null,
      supersededAt: null,
      attempts: { lt: 5 },
    });
    expect((where.expiresAt as { gt: unknown }).gt).toBeInstanceOf(Date);
    expect(data?.consumedAt).toBeInstanceOf(Date);
  });

  it('reports a loss when the claim matches nothing', async () => {
    // Someone else consumed it first, or it expired, or it is out of attempts.
    updateManyCodes.mockResolvedValue({ count: 0 });

    await expect(
      service.claimVerificationCode({
        id: 'code-1',
        codeHash: '$2b$10$stored-hash',
        maxAttempts: 5,
      }),
    ).resolves.toBe(false);
  });

  it('increments the miss counter only while the budget allows it', async () => {
    await service.recordVerificationMiss({ id: 'code-1', maxAttempts: 5 });

    const { where, data } = firstCall(updateManyCodes);
    // The bound lives in the WHERE clause so parallel wrong guesses cannot all
    // read the same starting count and push the total past the budget.
    expect(where).toMatchObject({
      id: 'code-1',
      consumedAt: null,
      supersededAt: null,
      attempts: { lt: 5 },
    });
    expect(data).toEqual({ attempts: { increment: 1 } });
  });

  it('counts every code issued in the window, superseded ones included', async () => {
    countCodes.mockResolvedValue(3);
    const since = new Date('2026-11-04T11:00:00.000Z');

    await expect(
      service.countCodesIssuedSince({
        userId: 'user-1',
        purpose: VerificationPurpose.EMAIL_VERIFICATION,
        since,
      }),
    ).resolves.toBe(3);

    const { where } = firstCodeCount();
    expect(where).toEqual({
      userId: 'user-1',
      purpose: VerificationPurpose.EMAIL_VERIFICATION,
      createdAt: { gte: since },
    });
    // Deliberately unfiltered by state: the cap is on how often the account can
    // be mailed. Excluding superseded rows would let a resend loop run
    // unbounded while still passing its own check.
    expect(where).not.toHaveProperty('consumedAt');
    expect(where).not.toHaveProperty('supersededAt');
  });

  it('removes only the replacement it created and revives the code it replaced', async () => {
    await service.restoreSupersededCode({
      newCodeId: 'code-new',
      expectedNewHash: '$2b$10$new-hash',
      supersededId: 'code-old',
    });

    expect(firstCall(deleteManyCodes).where).toEqual({
      id: 'code-new',
      codeHash: '$2b$10$new-hash',
      consumedAt: null,
    });

    const restore = firstCall(updateManyCodes);
    expect(restore.where).toEqual({ id: 'code-old', consumedAt: null });
    expect(restore.data).toEqual({ supersededAt: null });
  });

  it('revives nothing when the replacement was already used', async () => {
    // count 0 means the row is gone or no longer untouched — a concurrent
    // resend already moved on, and undoing that would clobber it.
    deleteManyCodes.mockResolvedValue({ count: 0 });

    await service.restoreSupersededCode({
      newCodeId: 'code-new',
      expectedNewHash: '$2b$10$new-hash',
      supersededId: 'code-old',
    });

    expect(updateManyCodes).not.toHaveBeenCalled();
  });

  it('revives nothing when there was no previous code to restore', async () => {
    await service.restoreSupersededCode({
      newCodeId: 'code-new',
      expectedNewHash: '$2b$10$new-hash',
      supersededId: null,
    });

    expect(deleteManyCodes).toHaveBeenCalledTimes(1);
    expect(updateManyCodes).not.toHaveBeenCalled();
  });

  it('retires the superseded legacy columns on a successful verification', async () => {
    updateUser.mockResolvedValue({ id: 'user-1' });

    await service.markEmailVerified('user-1');

    expect(updateUser).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        isEmailVerified: true,
        emailVerifyToken: null,
        emailVerifyExpiry: null,
      },
    });
  });
});

/**
 * Addresses are compared case-insensitively in practice but Postgres compares
 * the `@unique` column case-sensitively. Registration now lowercases, so the
 * lookup has to reach accounts stored either way — without changing how any
 * existing account behaves.
 */
describe('UsersService.findByEmail — exact match first, then normalised', () => {
  const findUserByEmail = jest.fn();
  const prisma = {
    user: { findUnique: findUserByEmail },
  } as unknown as PrismaService;
  const service = new UsersService(prisma, mail, config);

  beforeEach(() => {
    findUserByEmail.mockReset();
  });

  it('returns the exact match without a second query', async () => {
    const account = { id: 'user-1', email: 'Abebe@X.com' };
    findUserByEmail.mockResolvedValue(account);

    await expect(service.findByEmail('Abebe@X.com')).resolves.toBe(account);
    expect(findUserByEmail).toHaveBeenCalledTimes(1);
    expect(findUserByEmail).toHaveBeenCalledWith({
      where: { email: 'Abebe@X.com' },
    });
  });

  it('falls back to the lowercased form registration now stores', async () => {
    const account = { id: 'user-1', email: 'abebe@x.com' };
    findUserByEmail.mockResolvedValueOnce(null).mockResolvedValueOnce(account);

    await expect(service.findByEmail('Abebe@X.com')).resolves.toBe(account);
    expect(findUserByEmail).toHaveBeenNthCalledWith(2, {
      where: { email: 'abebe@x.com' },
    });
  });

  it('does not query twice when the address is already lowercase', async () => {
    findUserByEmail.mockResolvedValue(null);

    await expect(service.findByEmail('abebe@x.com')).resolves.toBeNull();
    expect(findUserByEmail).toHaveBeenCalledTimes(1);
  });

  it('trims before the fallback lookup', async () => {
    const account = { id: 'user-1', email: 'abebe@x.com' };
    findUserByEmail.mockResolvedValueOnce(null).mockResolvedValueOnce(account);

    await expect(service.findByEmail('  Abebe@X.com  ')).resolves.toBe(account);
    expect(findUserByEmail).toHaveBeenNthCalledWith(2, {
      where: { email: 'abebe@x.com' },
    });
  });
});
