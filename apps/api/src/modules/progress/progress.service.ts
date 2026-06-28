import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ProgressService {
  constructor(private readonly prisma: PrismaService) {}

  // Record (or refresh) that a user has viewed a material. Idempotent via the
  // @@unique([userId, materialId]) constraint.
  async recordView(userId: string, materialId: string) {
    const material = await this.prisma.material.findUnique({
      where: { id: materialId },
      select: { id: true },
    });
    if (!material) throw new NotFoundException('Material not found');

    await this.prisma.progressRecord.upsert({
      where: { userId_materialId: { userId, materialId } },
      create: { userId, materialId },
      update: { viewedAt: new Date() },
    });

    return { ok: true };
  }

  // Per-course + overall progress for the student's whole department, plus a
  // simple quiz summary. Drives the dashboard bars and the progress page.
  async getMyProgress(userId: string) {
    const student = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { departmentId: true },
    });

    const empty = {
      overall: { total: 0, viewed: 0, pct: 0 },
      courses: [] as {
        courseId: string;
        title: string;
        totalMaterials: number;
        viewedMaterials: number;
        pct: number;
      }[],
      quizzes: { taken: 0, avgPct: 0 },
    };
    if (!student?.departmentId) return empty;

    const courses = await this.prisma.course.findMany({
      where: {
        isArchived: false,
        isPublished: true,
        semester: { academicYear: { departmentId: student.departmentId } },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        title: true,
        materials: { select: { id: true } },
      },
    });

    const viewed = await this.prisma.progressRecord.findMany({
      where: { userId },
      select: { materialId: true },
    });
    const viewedSet = new Set(viewed.map((v) => v.materialId));

    const courseStats = courses.map((c) => {
      const total = c.materials.length;
      const seen = c.materials.filter((m) => viewedSet.has(m.id)).length;
      return {
        courseId: c.id,
        title: c.title,
        totalMaterials: total,
        viewedMaterials: seen,
        pct: total ? Math.round((seen / total) * 100) : 0,
      };
    });

    const total = courseStats.reduce((s, c) => s + c.totalMaterials, 0);
    const seen = courseStats.reduce((s, c) => s + c.viewedMaterials, 0);

    const attempts = await this.prisma.quizAttempt.findMany({
      where: { userId },
      select: { score: true, totalQ: true },
    });
    const avgPct = attempts.length
      ? Math.round(
          (attempts.reduce(
            (s, a) => s + (a.totalQ ? a.score / a.totalQ : 0),
            0,
          ) /
            attempts.length) *
            100,
        )
      : 0;

    return {
      overall: {
        total,
        viewed: seen,
        pct: total ? Math.round((seen / total) * 100) : 0,
      },
      courses: courseStats,
      quizzes: { taken: attempts.length, avgPct },
    };
  }
}
