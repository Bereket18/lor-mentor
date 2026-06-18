import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAcademicYearDto } from './dto/create-academic-year.dto';
import { UpdateAcademicYearDto } from './dto/update-academic-year.dto';

@Injectable()
export class AcademicYearsService {
  constructor(private readonly prisma: PrismaService) {}

  // List all years for one department — used in registration dropdown
  // and admin management screen
  async findByDepartment(departmentId: string) {
    return this.prisma.academicYear.findMany({
      where: { departmentId, isArchived: false },
      orderBy: { label: 'asc' },
      include: {
        _count: { select: { semesters: true } },
      },
    });
  }

  async findOne(id: string) {
    const year = await this.prisma.academicYear.findUnique({
      where: { id },
      include: {
        department: { select: { id: true, name: true } },
        semesters: {
          where: { isArchived: false },
          orderBy: { name: 'asc' },
        },
      },
    });

    if (!year) throw new NotFoundException('Academic year not found');
    return year;
  }

  // ADMIN: create a year under a department
  // We verify the department exists first — prevents orphaned years
  async create(dto: CreateAcademicYearDto) {
    const department = await this.prisma.department.findUnique({
      where: { id: dto.departmentId },
    });

    if (!department) {
      throw new NotFoundException('Department not found');
    }

    return this.prisma.academicYear.create({
      data: {
        departmentId: dto.departmentId,
        label: dto.label,
      },
    });
  }

  async update(id: string, dto: UpdateAcademicYearDto) {
    await this.ensureExists(id);
    return this.prisma.academicYear.update({ where: { id }, data: dto });
  }

  async archive(id: string) {
    await this.ensureExists(id);
    return this.prisma.academicYear.update({
      where: { id },
      data: { isArchived: true },
    });
  }

  private async ensureExists(id: string) {
    const year = await this.prisma.academicYear.findUnique({ where: { id } });
    if (!year) throw new NotFoundException('Academic year not found');
  }
}
