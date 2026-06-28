import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { DepartmentsModule } from './modules/departments/departments.module';
import { AcademicYearsModule } from './modules/academic-years/academic-years.module';
import { SemestersModule } from './modules/semesters/semesters.module';
import { CoursesModule } from './modules/courses/courses.module';
import { MaterialsModule } from './modules/materials/materials.module';
import { PlansModule } from './modules/plans/plans.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { AiModule } from './modules/ai/ai.module';
import { ForumModule } from './modules/forum/forum.module';
import { FlashcardsModule } from './modules/flashcards/flashcards.module';
import { QuizModule } from './modules/quiz/quiz.module';
import { TutorModule } from './modules/tutor/tutor.module';
import { ProgressModule } from './modules/progress/progress.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Root Redis connection — every BullMQ queue in the app shares this
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
      },
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    DepartmentsModule,
    AcademicYearsModule,
    SemestersModule,
    CoursesModule,
    MaterialsModule,
    PlansModule,
    PaymentsModule,
    SubscriptionsModule,
    AiModule,
    ForumModule,
    FlashcardsModule,
    QuizModule,
    TutorModule,
    ProgressModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
