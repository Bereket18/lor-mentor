import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { AiService } from '../ai/ai.service';
import {
  CreateMaterialDto,
  MaterialTypeInput,
} from './dto/create-material.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class MaterialsService {
  // Absolute path to our private uploads folder; never inside /public.
  private readonly uploadDir = path.join(process.cwd(), 'uploads', 'materials');

  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly aiService: AiService,
  ) {}

  async getAiStatusForMaterial(materialId: string) {
    return this.aiService.getStatus(materialId);
  }

  // List materials for a course without exposing internal file paths.
  async findByCourse(courseId: string) {
    const materials = await this.prisma.material.findMany({
      where: { courseId },
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
    });

    return this.withUploaderNames(materials);
  }

  async findOne(id: string) {
    const material = await this.findRawMaterial(id);
    return this.stripFilePath(material);
  }

  async createWithFile(
    dto: CreateMaterialDto,
    uploadedFile: Express.Multer.File,
    uploadedBy: string,
    uploaderRole: string,
  ) {
    await this.assertCanManageCourse(dto.courseId, uploadedBy, uploaderRole);

    if (dto.type === MaterialTypeInput.YOUTUBE) {
      throw new BadRequestException(
        'YouTube materials do not take a file upload',
      );
    }

    if (!uploadedFile) {
      throw new BadRequestException(
        'A file is required for PDF or IMAGE materials',
      );
    }

    const material = await this.prisma.material.create({
      data: {
        courseId: dto.courseId,
        title: dto.title,
        type: dto.type,
        filePath: uploadedFile.filename,
        uploadedBy,
      },
    });

    if (dto.type === MaterialTypeInput.PDF) {
      await this.aiService.enqueueGeneration(
        material.id,
        uploadedFile.filename,
      );
    }

    return this.stripFilePath(material);
  }

  async createYoutube(
    dto: CreateMaterialDto,
    uploadedBy: string,
    uploaderRole: string,
  ) {
    await this.assertCanManageCourse(dto.courseId, uploadedBy, uploaderRole);

    if (dto.type !== MaterialTypeInput.YOUTUBE) {
      throw new BadRequestException(
        'This endpoint only accepts YOUTUBE materials',
      );
    }

    if (!dto.youtubeUrl) {
      throw new BadRequestException(
        'youtubeUrl is required for YouTube materials',
      );
    }

    const material = await this.prisma.material.create({
      data: {
        courseId: dto.courseId,
        title: dto.title,
        type: dto.type,
        youtubeUrl: dto.youtubeUrl,
        uploadedBy,
      },
    });

    return this.stripFilePath(material);
  }

  async update(
    id: string,
    dto: UpdateMaterialDto,
    userId: string,
    role: string,
  ) {
    await this.assertCanManageMaterial(id, userId, role);
    const material = await this.prisma.material.update({
      where: { id },
      data: dto,
    });
    return this.stripFilePath(material);
  }

  async remove(id: string, userId: string, role: string) {
    const material = await this.assertCanManageMaterial(id, userId, role);

    if (material.filePath) {
      const fullPath = path.join(this.uploadDir, material.filePath);
      fs.unlink(fullPath, () => {});
    }

    await this.prisma.material.delete({ where: { id } });
    return { message: 'Material deleted' };
  }

  async getFilePathForStudent(materialId: string, studentId: string) {
    const material = await this.prisma.material.findUnique({
      where: { id: materialId },
      include: {
        course: {
          select: {
            isPublished: true,
            isArchived: true,
            semester: { select: { academicYearId: true } },
          },
        },
      },
    });

    if (!material) throw new NotFoundException('Material not found');
    if (!material.filePath) {
      throw new BadRequestException('This material has no file');
    }

    if (material.course.isArchived || !material.course.isPublished) {
      throw new ForbiddenException('This material is not currently available');
    }

    const student = await this.prisma.user.findUnique({
      where: { id: studentId },
      select: { academicYearId: true, role: true },
    });

    const isPrivileged =
      student?.role === 'ADMIN' ||
      student?.role === 'SUPER_ADMIN' ||
      student?.role === 'TEACHER';

    if (
      !isPrivileged &&
      student?.academicYearId !== material.course.semester.academicYearId
    ) {
      throw new ForbiddenException('You do not have access to this material');
    }

    if (student?.role === 'STUDENT') {
      await this.subscriptionsService.ensureActiveForStudent(
        studentId,
        student.role,
      );
      // Record the view (best-effort) so progress reflects opened materials
      await this.prisma.progressRecord.upsert({
        where: { userId_materialId: { userId: studentId, materialId } },
        create: { userId: studentId, materialId },
        update: { viewedAt: new Date() },
      });
    }

    const fullPath = path.join(this.uploadDir, material.filePath);

    if (!fs.existsSync(fullPath)) {
      throw new NotFoundException('File no longer exists on the server');
    }

    return {
      fullPath,
      mimeType: material.type === 'PDF' ? 'application/pdf' : 'image/jpeg',
    };
  }

  private isAdminRole(role: string) {
    return role === 'ADMIN' || role === 'SUPER_ADMIN';
  }

  private async assertCanManageCourse(
    courseId: string,
    userId: string,
    role: string,
  ) {
    const course = await this.ensureCourseExists(courseId);

    if (this.isAdminRole(role)) return course;
    if (role === 'TEACHER' && course.teacherId === userId) return course;

    throw new ForbiddenException('This course is not assigned to you');
  }

  private async assertCanManageMaterial(
    materialId: string,
    userId: string,
    role: string,
  ) {
    const material = await this.prisma.material.findUnique({
      where: { id: materialId },
      include: { course: { select: { teacherId: true } } },
    });

    if (!material) throw new NotFoundException('Material not found');
    if (this.isAdminRole(role)) return material;

    if (role === 'TEACHER' && material.course.teacherId === userId) {
      return material;
    }

    throw new ForbiddenException('This course is not assigned to you');
  }

  private async findRawMaterial(id: string) {
    const material = await this.prisma.material.findUnique({ where: { id } });
    if (!material) throw new NotFoundException('Material not found');
    return material;
  }

  private async ensureCourseExists(courseId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course) throw new NotFoundException('Course not found');
    return course;
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

  private stripFilePath(material: {
    filePath?: string | null;
    [key: string]: unknown;
  }) {
    const { filePath: _filePath, ...safe } = material;
    return safe;
  }
}
