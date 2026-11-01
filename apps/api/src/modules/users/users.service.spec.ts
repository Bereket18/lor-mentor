import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
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
    expect(createData.isAnatomyReviewer).toBe(true);
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
      expect.objectContaining({ where: { id: { in: ['course-a', 'course-b'] }, isArchived: false } }),
    );
    expect(updateManyCourses).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ['course-a', 'course-b'] } }),
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
    it('grants anatomy review access when a user becomes a teacher', async () => {
      findUser.mockResolvedValue({ role: 'STUDENT' });
      updateUser.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        fullName: 'New Teacher',
        role: 'TEACHER',
        isAnatomyReviewer: true,
      });

      await service.changeRole('user-1', 'TEACHER', 'actor-1', 'SUPER_ADMIN');

      expect(updateUser).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { role: 'TEACHER', isAnatomyReviewer: true },
        }),
      );
    });

    it('clears anatomy review access when a teacher leaves the role', async () => {
      findUser.mockResolvedValue({ role: 'TEACHER' });
      updateUser.mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        fullName: 'Former Teacher',
        role: 'ADMIN',
        isAnatomyReviewer: false,
      });

      await service.changeRole('user-1', 'ADMIN', 'actor-1', 'SUPER_ADMIN');

      expect(updateUser).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { role: 'ADMIN', isAnatomyReviewer: false },
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
