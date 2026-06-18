import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';

@Injectable()
export class CoursesService {
  constructor(private readonly prisma: PrismaService) {}

  // PUBLIC — only published, non-archived courses for guests/students
  async findBySemester(semesterId: string) {
    return this.prisma.course.findMany({
      where: { semesterId, isArchived: false, isPublished: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        teacher: { select: { id: true, fullName: true } },
        _count: { select: { materials: true } },
      },
    });
  }

  // Courses visible to a specific student — scoped to their own
  // department + academic year. This is the actual enforcement of
  // "students cannot access other departments' content."
  async findByStudent(studentId: string) {
    const student = await this.prisma.user.findUnique({
      where: { id: studentId },
      select: { departmentId: true, academicYearId: true },
    });

    if (!student?.departmentId || !student?.academicYearId) {
      // Student has no department/year set (e.g. legacy test account)
      return [];
    }

    return this.prisma.course.findMany({
      where: {
        isArchived: false,
        isPublished: true,
        semester: {
          academicYearId: student.academicYearId,
        },
      },
      orderBy: { sortOrder: 'asc' },
      include: {
        teacher: { select: { id: true, fullName: true } },
        _count: { select: { materials: true } },
      },
    });
  }

  // TEACHER — sees their own courses regardless of published status
  async findByTeacher(teacherId: string) {
    return this.prisma.course.findMany({
      where: { teacherId, isArchived: false },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { materials: true } },
      },
    });
  }

  // ADMIN — full list, all statuses
  async findAllAdmin() {
    return this.prisma.course.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        teacher: { select: { id: true, fullName: true } },
        semester: {
          select: {
            id: true,
            name: true,
            academicYear: {
              select: {
                label: true,
                department: { select: { name: true } },
              },
            },
          },
        },
      },
    });
  }

  async findOne(id: string) {
    const course = await this.prisma.course.findUnique({
      where: { id },
      include: {
        teacher: { select: { id: true, fullName: true, email: true } },
        semester: {
          select: {
            id: true,
            name: true,
            academicYear: {
              select: {
                id: true,
                label: true,
                department: { select: { id: true, name: true } },
              },
            },
          },
        },
        materials: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!course) throw new NotFoundException('Course not found');
    return course;
  }

  async create(dto: CreateCourseDto) {
    const semester = await this.prisma.semester.findUnique({
      where: { id: dto.semesterId },
    });
    if (!semester) throw new NotFoundException('Semester not found');

    return this.prisma.course.create({
      data: {
        semesterId: dto.semesterId,
        teacherId: dto.teacherId,
        title: dto.title,
        description: dto.description,
        isPublished: dto.isPublished ?? false,
      },
    });
  }

  async update(id: string, dto: UpdateCourseDto) {
    await this.ensureExists(id);
    return this.prisma.course.update({ where: { id }, data: dto });
  }

  async archive(id: string) {
    await this.ensureExists(id);
    return this.prisma.course.update({
      where: { id },
      data: { isArchived: true },
    });
  }

  private async ensureExists(id: string) {
    const course = await this.prisma.course.findUnique({ where: { id } });
    if (!course) throw new NotFoundException('Course not found');
  }
}
