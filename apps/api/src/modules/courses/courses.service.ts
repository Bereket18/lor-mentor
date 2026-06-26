import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';

interface CourseActor {
  id: string;
  role: string;
}

@Injectable()
export class CoursesService {
  constructor(private readonly prisma: PrismaService) {}

  // PUBLIC - only published, non-archived courses for guests/students.
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

  // ADMIN — all courses in a semester including drafts
  async findBySemesterAdmin(semesterId: string) {
    return this.prisma.course.findMany({
      where: { semesterId, isArchived: false },
      orderBy: { sortOrder: 'asc' },
      include: {
        teacher: { select: { id: true, fullName: true } },
        _count: { select: { materials: true } },
      },
    });
  }

  async findByStudent(studentId: string) {
    const student = await this.prisma.user.findUnique({
      where: { id: studentId },
      select: { departmentId: true, academicYearId: true },
    });

    if (!student?.departmentId || !student?.academicYearId) {
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
        semester: { select: { id: true, name: true } },
        _count: { select: { materials: true } },
      },
    });
  }

  async findByTeacher(teacherId: string) {
    return this.prisma.course.findMany({
      where: { teacherId, isArchived: false },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { materials: true } },
      },
    });
  }

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
          select: {
            id: true,
            title: true,
            type: true,
            youtubeUrl: true,
            isSample: true,
            sortOrder: true,
            createdAt: true,
            uploadedBy: true,
          },
        },
      },
    });

    if (!course) throw new NotFoundException('Course not found');

    return {
      ...course,
      materials: await this.withUploaderNames(course.materials),
    };
  }

  async create(dto: CreateCourseDto) {
    const semester = await this.prisma.semester.findUnique({
      where: { id: dto.semesterId },
    });
    if (!semester) throw new NotFoundException('Semester not found');

    if (dto.teacherId) {
      await this.ensureTeacher(dto.teacherId);
    }

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

  async update(id: string, dto: UpdateCourseDto, actor: CourseActor) {
    const course = await this.ensureExists(id);

    if (actor.role === 'TEACHER') {
      if (course.teacherId !== actor.id) {
        throw new ForbiddenException('This course is not assigned to you');
      }
      if (dto.teacherId !== undefined) {
        throw new ForbiddenException('Teachers cannot reassign courses');
      }
    }

    if (dto.teacherId) {
      await this.ensureTeacher(dto.teacherId);
    }

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
    return course;
  }

  private async ensureTeacher(userId: string) {
    const teacher = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, isActive: true },
    });

    if (!teacher || teacher.role !== 'TEACHER' || !teacher.isActive) {
      throw new BadRequestException('Selected teacher is not valid');
    }
  }

  private async withUploaderNames<T extends { uploadedBy: string }>(
    materials: T[],
  ) {
    const uploaderIds = [...new Set(materials.map((m) => m.uploadedBy))];
    const uploaders = await this.prisma.user.findMany({
      where: { id: { in: uploaderIds } },
      select: { id: true, fullName: true },
    });
    const uploadersById = new Map(uploaders.map((u) => [u.id, u]));

    return materials.map((material) => ({
      ...material,
      uploader: uploadersById.get(material.uploadedBy) ?? null,
    }));
  }
}
