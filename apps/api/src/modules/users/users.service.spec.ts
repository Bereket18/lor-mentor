import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from './users.service';
import type { CreateUserDto } from './dto/create-user.dto';

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

  const service = new UsersService(prisma);

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
    expect(result.temporaryPassword).toMatch(/^[0-9a-f]{12}$/);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: 'TEACHER' }),
      }),
    );
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
    $transaction: transactionMock,
  } as unknown as PrismaService;

  const service = new UsersService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    findManyUsers.mockResolvedValue([]);
    countUsers.mockResolvedValue(0);
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
