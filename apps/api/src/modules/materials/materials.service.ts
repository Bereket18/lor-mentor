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
  // Absolute path to our private uploads folder — never inside /public
  private readonly uploadDir = path.join(process.cwd(), 'uploads', 'materials');
  async getAiStatusForMaterial(materialId: string) {
    return this.aiService.getStatus(materialId);
  }
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly aiService: AiService,
  ) {}

  // ── List materials for a course (used inside course detail) ────
  async findByCourse(courseId: string) {
    return this.prisma.material.findMany({
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
        // Deliberately NOT selecting filePath — that is an internal
        // server detail, never sent to the frontend
      },
    });
  }

  async findOne(id: string) {
    const material = await this.prisma.material.findUnique({ where: { id } });
    if (!material) throw new NotFoundException('Material not found');
    return material;
  }

  // ── Create a PDF or IMAGE material — file already saved by Multer ──
  // uploadedFile comes from the controller after Multer processes the
  // multipart/form-data request
  async createWithFile(
    dto: CreateMaterialDto,
    uploadedFile: Express.Multer.File,
    uploadedBy: string,
  ) {
    await this.ensureCourseExists(dto.courseId);

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
        filePath: uploadedFile.filename, // store just the filename, not full path
        uploadedBy,
      },
    });

    // Only PDFs get AI processing — images have no extractable text.
    // This is fire-and-forget from here: the upload response goes back
    // to the teacher immediately while the job runs independently.
    if (dto.type === MaterialTypeInput.PDF) {
      await this.aiService.enqueueGeneration(
        material.id,
        uploadedFile.filename,
      );
    }

    return this.stripFilePath(material);
  }

  // ── Create a YouTube material — no file involved ───────────────
  async createYoutube(dto: CreateMaterialDto, uploadedBy: string) {
    await this.ensureCourseExists(dto.courseId);

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

  async update(id: string, dto: UpdateMaterialDto) {
    await this.findOne(id);
    const material = await this.prisma.material.update({
      where: { id },
      data: dto,
    });
    return this.stripFilePath(material);
  }

  // ── Delete a material — also removes the file from disk ────────
  async remove(id: string) {
    const material = await this.findOne(id);

    if (material.filePath) {
      const fullPath = path.join(this.uploadDir, material.filePath);
      // Delete the physical file, but don't crash if it's already gone
      fs.unlink(fullPath, () => {});
    }

    await this.prisma.material.delete({ where: { id } });
    return { message: 'Material deleted' };
  }

  // ── THE MOST IMPORTANT METHOD THIS SPRINT ───────────────────────
  // Returns the absolute file path for streaming, AFTER verifying
  // the requesting student is actually allowed to see this course's
  // content (same department + academic year check as Sprint 3)
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
    if (!material.filePath)
      throw new BadRequestException('This material has no file');

    if (material.course.isArchived || !material.course.isPublished) {
      throw new ForbiddenException('This material is not currently available');
    }

    // Re-verify the student's own department/year matches the course's
    // year — exactly the same Zero Trust check from Sprint 3, applied
    // again here because file access is its own sensitive operation
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

  // ── Helpers ───────────────────────────────────────────────────
  private async ensureCourseExists(courseId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course) throw new NotFoundException('Course not found');
  }

  // Never send filePath to the frontend — it's an internal server detail
  private stripFilePath(material: {
    filePath?: string | null;
    [key: string]: unknown;
  }) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { filePath: _filePath, ...safe } = material;
    return safe;
  }
}
