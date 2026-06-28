import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePostDto } from './dto/create-post.dto';
import { CreateReplyDto } from './dto/create-reply.dto';
import { ReactionDto } from './dto/reaction.dto';
import { ReportDto } from './dto/report.dto';

// What we expose about a post/reply author — never the whole user record
const authorSelect = {
  select: { id: true, fullName: true, role: true },
} as const;

const PRIVILEGED = ['TEACHER', 'ADMIN', 'SUPER_ADMIN'];

interface ReactionRow {
  type: string;
  userId: string;
}

@Injectable()
export class ForumService {
  constructor(private readonly prisma: PrismaService) {}

  // Each course has exactly one forum section (courseId is unique). We create
  // it lazily the first time someone opens the course forum.
  private async getOrCreateSection(courseId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course) throw new NotFoundException('Course not found');

    const existing = await this.prisma.forumSection.findUnique({
      where: { courseId },
    });
    if (existing) return existing;

    return this.prisma.forumSection.create({
      data: { courseId, type: 'COURSE' },
    });
  }

  // ── Reaction helpers ──────────────────────────────────────────
  private summarize(rows: ReactionRow[], userId: string) {
    const counts: Record<string, number> = {};
    const mine: string[] = [];
    for (const r of rows) {
      counts[r.type] = (counts[r.type] ?? 0) + 1;
      if (r.userId === userId) mine.push(r.type);
    }
    return { counts, mine };
  }

  private async attachPostReactions<T extends { id: string }>(
    posts: T[],
    userId: string,
  ) {
    if (!posts.length)
      return [] as (T & { reactions: ReturnType<ForumService['summarize']> })[];
    const ids = posts.map((p) => p.id);
    const rows = await this.prisma.reaction.findMany({
      where: { postId: { in: ids } },
      select: { postId: true, type: true, userId: true },
    });
    const byTarget = new Map<string, ReactionRow[]>();
    for (const r of rows) {
      if (!r.postId) continue;
      const arr = byTarget.get(r.postId) ?? [];
      arr.push({ type: r.type, userId: r.userId });
      byTarget.set(r.postId, arr);
    }
    return posts.map((p) => ({
      ...p,
      reactions: this.summarize(byTarget.get(p.id) ?? [], userId),
    }));
  }

  private async attachReplyReactions<T extends { id: string }>(
    replies: T[],
    userId: string,
  ) {
    if (!replies.length)
      return [] as (T & { reactions: ReturnType<ForumService['summarize']> })[];
    const ids = replies.map((r) => r.id);
    const rows = await this.prisma.reaction.findMany({
      where: { replyId: { in: ids } },
      select: { replyId: true, type: true, userId: true },
    });
    const byTarget = new Map<string, ReactionRow[]>();
    for (const r of rows) {
      if (!r.replyId) continue;
      const arr = byTarget.get(r.replyId) ?? [];
      arr.push({ type: r.type, userId: r.userId });
      byTarget.set(r.replyId, arr);
    }
    return replies.map((r) => ({
      ...r,
      reactions: this.summarize(byTarget.get(r.id) ?? [], userId),
    }));
  }

  // ── Threads ───────────────────────────────────────────────────

  // Section + its threads (pinned first, then newest), with author, reply
  // count, and reaction summary.
  async getCourseForum(courseId: string, userId: string) {
    const section = await this.getOrCreateSection(courseId);

    const posts = await this.prisma.forumPost.findMany({
      where: { sectionId: section.id, isRemoved: false },
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        title: true,
        content: true,
        isPinned: true,
        createdAt: true,
        author: authorSelect,
        _count: { select: { replies: { where: { isRemoved: false } } } },
      },
    });

    return {
      sectionId: section.id,
      courseId,
      posts: await this.attachPostReactions(posts, userId),
    };
  }

  // A single thread with all its visible replies + reactions
  async getPost(id: string, userId: string) {
    const post = await this.prisma.forumPost.findFirst({
      where: { id, isRemoved: false },
      select: {
        id: true,
        title: true,
        content: true,
        isPinned: true,
        createdAt: true,
        author: authorSelect,
        replies: {
          where: { isRemoved: false },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            content: true,
            createdAt: true,
            author: authorSelect,
          },
        },
      },
    });

    if (!post) throw new NotFoundException('Post not found');

    const [withReactions] = await this.attachPostReactions([post], userId);
    const replies = await this.attachReplyReactions(post.replies, userId);
    return { ...withReactions, replies };
  }

  async createPost(authorId: string, dto: CreatePostDto) {
    const section = await this.getOrCreateSection(dto.courseId);

    return this.prisma.forumPost.create({
      data: {
        sectionId: section.id,
        authorId,
        title: dto.title,
        content: dto.content,
      },
      select: {
        id: true,
        title: true,
        content: true,
        isPinned: true,
        createdAt: true,
        author: authorSelect,
        _count: { select: { replies: true } },
      },
    });
  }

  async createReply(postId: string, authorId: string, dto: CreateReplyDto) {
    const post = await this.prisma.forumPost.findFirst({
      where: { id: postId, isRemoved: false },
    });
    if (!post) throw new NotFoundException('Post not found');

    return this.prisma.forumReply.create({
      data: { postId, authorId, content: dto.content },
      select: {
        id: true,
        content: true,
        createdAt: true,
        author: authorSelect,
      },
    });
  }

  // Soft-delete a thread. Allowed for the author or any privileged role.
  async removePost(postId: string, userId: string, role: string) {
    const post = await this.prisma.forumPost.findUnique({
      where: { id: postId },
    });
    if (!post || post.isRemoved) throw new NotFoundException('Post not found');

    if (post.authorId !== userId && !PRIVILEGED.includes(role)) {
      throw new ForbiddenException('You cannot remove this post');
    }

    await this.prisma.forumPost.update({
      where: { id: postId },
      data: { isRemoved: true },
    });
    return { message: 'Post removed' };
  }

  // Soft-delete a reply. Author or privileged role.
  async removeReply(replyId: string, userId: string, role: string) {
    const reply = await this.prisma.forumReply.findUnique({
      where: { id: replyId },
    });
    if (!reply || reply.isRemoved)
      throw new NotFoundException('Reply not found');

    if (reply.authorId !== userId && !PRIVILEGED.includes(role)) {
      throw new ForbiddenException('You cannot remove this reply');
    }

    await this.prisma.forumReply.update({
      where: { id: replyId },
      data: { isRemoved: true },
    });
    return { message: 'Reply removed' };
  }

  // ── Reactions ─────────────────────────────────────────────────
  async toggleReaction(userId: string, dto: ReactionDto) {
    const { postId, replyId, type } = this.requireOneTarget(dto);

    if (postId) {
      const exists = await this.prisma.forumPost.findFirst({
        where: { id: postId, isRemoved: false },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException('Post not found');
    } else {
      const exists = await this.prisma.forumReply.findFirst({
        where: { id: replyId, isRemoved: false },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException('Reply not found');
    }

    const existing = await this.prisma.reaction.findFirst({
      where: {
        userId,
        postId: postId ?? null,
        replyId: replyId ?? null,
        type: type as never,
      },
    });
    if (existing) {
      await this.prisma.reaction.delete({ where: { id: existing.id } });
    } else {
      await this.prisma.reaction.create({
        data: {
          userId,
          postId: postId ?? null,
          replyId: replyId ?? null,
          type: type as never,
        },
      });
    }

    const rows = await this.prisma.reaction.findMany({
      where: postId ? { postId } : { replyId },
      select: { type: true, userId: true },
    });
    return this.summarize(rows, userId);
  }

  // ── Reports ───────────────────────────────────────────────────
  async createReport(reporterId: string, dto: ReportDto) {
    const { postId, replyId } = this.requireOneTarget(dto);

    if (postId) {
      const exists = await this.prisma.forumPost.findUnique({
        where: { id: postId },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException('Post not found');
    } else {
      const exists = await this.prisma.forumReply.findUnique({
        where: { id: replyId },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException('Reply not found');
    }

    // Don't let the same user pile up pending reports on the same content
    const dup = await this.prisma.report.findFirst({
      where: {
        reporterId,
        postId: postId ?? null,
        replyId: replyId ?? null,
        status: 'PENDING',
      },
    });
    if (dup) return { message: 'You have already reported this' };

    await this.prisma.report.create({
      data: {
        reporterId,
        postId: postId ?? null,
        replyId: replyId ?? null,
        reason: dto.reason as never,
        note: dto.note ?? null,
      },
    });
    return { message: 'Report submitted' };
  }

  // ── Moderation (admin) ────────────────────────────────────────
  async listReports() {
    return this.prisma.report.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        reason: true,
        note: true,
        status: true,
        createdAt: true,
        reporter: { select: { id: true, fullName: true } },
        post: {
          select: {
            id: true,
            title: true,
            content: true,
            isRemoved: true,
            author: authorSelect,
          },
        },
        reply: {
          select: {
            id: true,
            content: true,
            isRemoved: true,
            author: authorSelect,
          },
        },
      },
    });
  }

  async resolveReport(
    reportId: string,
    action: 'REMOVE' | 'DISMISS',
    reviewerId: string,
  ) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
    });
    if (!report) throw new NotFoundException('Report not found');

    if (action === 'REMOVE') {
      if (report.postId) {
        await this.prisma.forumPost.update({
          where: { id: report.postId },
          data: { isRemoved: true },
        });
      }
      if (report.replyId) {
        await this.prisma.forumReply.update({
          where: { id: report.replyId },
          data: { isRemoved: true },
        });
      }
    }

    await this.prisma.report.update({
      where: { id: reportId },
      data: {
        status: action === 'REMOVE' ? 'ACTIONED' : 'DISMISSED',
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
      },
    });

    return {
      message: action === 'REMOVE' ? 'Content removed' : 'Report dismissed',
    };
  }

  // Exactly one of postId / replyId must be present
  private requireOneTarget<T extends { postId?: string; replyId?: string }>(
    dto: T,
  ) {
    const { postId, replyId } = dto;
    if ((!postId && !replyId) || (postId && replyId)) {
      throw new BadRequestException('Provide exactly one of postId or replyId');
    }
    return dto;
  }
}
