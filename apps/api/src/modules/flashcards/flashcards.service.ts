import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ReviewDto } from './dto/review.dto';

@Injectable()
export class FlashcardsService {
  constructor(private readonly prisma: PrismaService) {}

  // All AI-generated flashcard sets for a course's materials, annotated with
  // how many cards this user has already marked "known".
  async getSetsForCourse(courseId: string, userId: string) {
    const sets = await this.prisma.flashcardSet.findMany({
      where: { aiContent: { material: { courseId } } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        createdAt: true,
        _count: { select: { cards: true } },
        aiContent: {
          select: { material: { select: { id: true, title: true } } },
        },
      },
    });

    if (sets.length === 0) return [];

    const setIds = sets.map((s) => s.id);
    const known = await this.prisma.flashcardReview.findMany({
      where: { userId, flashcardSetId: { in: setIds }, isKnown: true },
      select: { flashcardSetId: true },
    });
    const knownBySet = known.reduce<Record<string, number>>((acc, r) => {
      acc[r.flashcardSetId] = (acc[r.flashcardSetId] ?? 0) + 1;
      return acc;
    }, {});

    return sets.map((s) => ({
      id: s.id,
      title: s.title,
      materialTitle: s.aiContent.material.title,
      totalCards: s._count.cards,
      knownCount: knownBySet[s.id] ?? 0,
    }));
  }

  // A single set with its cards and this user's known/unknown state per card.
  async getSet(setId: string, userId: string) {
    const set = await this.prisma.flashcardSet.findUnique({
      where: { id: setId },
      select: {
        id: true,
        title: true,
        cards: {
          orderBy: { sortOrder: 'asc' },
          select: { id: true, front: true, back: true },
        },
      },
    });
    if (!set) throw new NotFoundException('Flashcard set not found');

    const reviews = await this.prisma.flashcardReview.findMany({
      where: { userId, flashcardSetId: setId },
      select: { cardId: true, isKnown: true },
    });
    const knownMap = new Map(reviews.map((r) => [r.cardId, r.isKnown]));

    return {
      id: set.id,
      title: set.title,
      cards: set.cards.map((c) => ({
        ...c,
        isKnown: knownMap.get(c.id) ?? null,
      })),
    };
  }

  // Record (or update) whether the user knows a card. One review per
  // (user, card) thanks to the @@unique constraint — so we upsert.
  async review(setId: string, userId: string, dto: ReviewDto) {
    const card = await this.prisma.flashcard.findFirst({
      where: { id: dto.cardId, flashcardSetId: setId },
      select: { id: true },
    });
    if (!card) throw new NotFoundException('Card not found in this set');

    await this.prisma.flashcardReview.upsert({
      where: { userId_cardId: { userId, cardId: dto.cardId } },
      create: {
        userId,
        cardId: dto.cardId,
        flashcardSetId: setId,
        isKnown: dto.isKnown,
      },
      update: { isKnown: dto.isKnown },
    });

    return { message: 'Saved' };
  }
}
