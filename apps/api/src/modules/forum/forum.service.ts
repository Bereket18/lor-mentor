import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePostDto } from './dto/create-post.dto';
import { CreateReplyDto } from './dto/create-reply.dto';

// What we expose about a post/reply author — never the whole user record
const authorSelect = {
  select: { id: true, fullName: true, role: true },
} as const;

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

  // Section + its threads (pinned first, then newest), with author + reply count
  async getCourseForum(courseId: string) {
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

    return { sectionId: section.id, courseId, posts };
  }

  // A single thread with all its visible replies
  async getPost(id: string) {
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
    return post;
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

    const privileged = ['TEACHER', 'ADMIN', 'SUPER_ADMIN'].includes(role);
    if (post.authorId !== userId && !privileged) {
      throw new ForbiddenException('You cannot remove this post');
    }

    await this.prisma.forumPost.update({
      where: { id: postId },
      data: { isRemoved: true },
    });
    return { message: 'Post removed' };
  }
}
