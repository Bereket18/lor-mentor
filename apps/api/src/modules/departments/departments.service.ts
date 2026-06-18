import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

@Injectable()
export class DepartmentsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── PUBLIC: Anyone can browse active departments ─────────────
  // Used on the landing page and registration dropdown
  async findAllPublic() {
    return this.prisma.department.findMany({
      where: { isArchived: false },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        coverImage: true,
        // Count how many courses exist — shown on department cards
        _count: {
          select: { academicYears: true },
        },
      },
    });
  }

  // ── ADMIN: Full list including archived ───────────────────────
  async findAllAdmin() {
    return this.prisma.department.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { academicYears: true, users: true },
        },
      },
    });
  }

  // ── Get one department with full academic structure ──────────
  // Used on the department detail page — shows years and semesters
  async findOne(id: string) {
    const department = await this.prisma.department.findUnique({
      where: { id },
      include: {
        academicYears: {
          where: { isArchived: false },
          orderBy: { label: 'asc' },
          include: {
            semesters: {
              where: { isArchived: false },
              orderBy: { name: 'asc' },
              include: {
                _count: { select: { courses: true } },
              },
            },
          },
        },
      },
    });

    if (!department) {
      throw new NotFoundException('Department not found');
    }

    return department;
  }

  // ── ADMIN: Create a new department ────────────────────────────
  async create(dto: CreateDepartmentDto) {
    // Check name is not already taken — @unique in schema also
    // enforces this, but we check first for a clean error message
    const existing = await this.prisma.department.findUnique({
      where: { name: dto.name },
    });

    if (existing) {
      throw new ConflictException(
        `A department named "${dto.name}" already exists`,
      );
    }

    return this.prisma.department.create({
      data: {
        name: dto.name,
        description: dto.description,
      },
    });
  }

  // ── ADMIN: Update a department ─────────────────────────────────
  async update(id: string, dto: UpdateDepartmentDto) {
    await this.ensureExists(id);

    return this.prisma.department.update({
      where: { id },
      data: dto,
    });
  }

  // ── ADMIN: Archive a department (soft delete) ──────────────────
  // We never hard-delete — too much linked data (courses, students)
  async archive(id: string) {
    await this.ensureExists(id);

    return this.prisma.department.update({
      where: { id },
      data: { isArchived: true },
    });
  }

  // ── ADMIN: Restore an archived department ───────────────────────
  async restore(id: string) {
    await this.ensureExists(id);

    return this.prisma.department.update({
      where: { id },
      data: { isArchived: false },
    });
  }

  // ── Private helper: throw if department does not exist ─────────
  private async ensureExists(id: string) {
    const department = await this.prisma.department.findUnique({
      where: { id },
    });

    if (!department) {
      throw new NotFoundException('Department not found');
    }
  }
}
