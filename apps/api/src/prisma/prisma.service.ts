import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    // Prisma 7 requires a database adapter passed into the constructor
    // We create a PostgreSQL connection pool and wrap it with PrismaPg
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });

    const adapter = new PrismaPg(pool);

    // Pass the adapter to PrismaClient via super()
    // super() calls the parent class constructor — PrismaClient
    super({ adapter });
  }

  // Called automatically when the NestJS app starts
  async onModuleInit() {
    await this.$connect();
    console.log('✅ Database connected');
  }

  // Called automatically when the NestJS app shuts down
  async onModuleDestroy() {
    await this.$disconnect();
    console.log('Database disconnected');
  }
}
