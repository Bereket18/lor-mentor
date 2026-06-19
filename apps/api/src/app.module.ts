import { Module } from '@nestjs/common';
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
