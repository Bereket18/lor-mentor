import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSemesterDto } from './dto/create-semester.dto';
import { UpdateSemesterDto } from './dto/update-semester.dto';

@Injectable()
export class SemestersService {
  constructor(private readonly prisma: PrismaService) {}

  async findByYear(academicYearId: string) {
    return this.prisma.semester.findMany({
      where: { academicYearId, isArchived: false },
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { courses: true } },
      },
    });
  }

  async findOne(id: string) {
    const semester = await this.prisma.semester.findUnique({
      where: { id },
      include: {
        academicYear: {
          select: {
            id: true,
            label: true,
            department: { select: { id: true, name: true } },
          },
        },
        courses: {
          where: { isArchived: false },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!semester) throw new NotFoundException('Semester not found');
    return semester;
  }

  async create(dto: CreateSemesterDto) {
    const year = await this.prisma.academicYear.findUnique({
      where: { id: dto.academicYearId },
    });
    if (!year) throw new NotFoundException('Academic year not found');

    return this.prisma.semester.create({
      data: {
        academicYearId: dto.academicYearId,
        name: dto.name,
      },
    });
  }

  async update(id: string, dto: UpdateSemesterDto) {
    await this.ensureExists(id);
    return this.prisma.semester.update({ where: { id }, data: dto });
  }

  async archive(id: string) {
    await this.ensureExists(id);
    return this.prisma.semester.update({
      where: { id },
      data: { isArchived: true },
    });
  }

  private async ensureExists(id: string) {
    const semester = await this.prisma.semester.findUnique({ where: { id } });
    if (!semester) throw new NotFoundException('Semester not found');
  }
}
