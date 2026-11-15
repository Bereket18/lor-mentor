/**
 * Support centre fixture data for screenshots and Playwright UI tests.
 *
 * Creates one student and one super admin, a plan with four payments in
 * different states, and five tickets that together exercise every queue state
 * (open with unread staff reply, awaiting student, resolved, closed, and a
 * payment ticket linked to a long-pending payment). One student message carries
 * a real re-encoded PNG so the authenticated thumbnail path is exercised too.
 *
 * Safety:
 *  - refuses NODE_ENV=production;
 *  - refuses any DATABASE_URL that is not a disposable database (see
 *    `common/utils/disposable-database.ts`);
 *  - only touches rows belonging to the two fixture accounts.
 *
 * Usage (from apps/api):
 *   $env:DATABASE_URL = 'postgresql://qa@127.0.0.1:55433/lor_support_qa?schema=public'
 *   npm run seed:support-fixtures
 *
 * It is idempotent: re-running wipes the fixture accounts' tickets, payments
 * and subscriptions, then recreates them with new ids.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';
import sharp from 'sharp';
import { assertDisposableDatabaseUrl } from '../common/utils/disposable-database';
import {
  ensureSupportUploadDir,
  resolveSupportUploadDir,
} from '../modules/support/support-attachments.storage';

const STUDENT_EMAIL = 'student.support@lorcan.edu.et';
const STUDENT_PASSWORD = 'SupportStudent!2026';
const ADMIN_EMAIL = 'admin.support@lorcan.edu.et';
const ADMIN_PASSWORD = 'SupportAdmin!2026';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function ago(ms: number): Date {
  return new Date(Date.now() - ms);
}

/** A readable placeholder receipt: teal panel with a caption. */
async function buildFixtureImage(): Promise<Buffer> {
  const panel = {
    create: {
      width: 800,
      height: 450,
      channels: 4 as const,
      background: { r: 13, g: 148, b: 136, alpha: 1 },
    },
  };
  const caption = Buffer.from(
    `<svg width="800" height="450" xmlns="http://www.w3.org/2000/svg">
       <rect x="24" y="24" width="752" height="402" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="2"/>
       <text x="400" y="205" text-anchor="middle" font-family="sans-serif" font-size="34" fill="#ffffff">Bank transfer receipt</text>
       <text x="400" y="255" text-anchor="middle" font-family="sans-serif" font-size="20" fill="#ffffff" fill-opacity="0.85">QA fixture image - not a real receipt</text>
     </svg>`,
  );
  try {
    return await sharp(panel).composite([{ input: caption }]).png().toBuffer();
  } catch {
    // librsvg is not guaranteed in every build; a plain panel is still a valid
    // attachment and keeps the fixture runnable.
    return sharp(panel).png().toBuffer();
  }
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed fixtures with NODE_ENV=production.');
  }
  const databaseUrl = assertDisposableDatabaseUrl(process.env.DATABASE_URL);

  const uploadDir = resolveSupportUploadDir(process.env.SUPPORT_UPLOAD_DIR);
  ensureSupportUploadDir(uploadDir);

  const pool = new Pool({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    console.log('Support fixture seed');
    console.log(`  directory: ${uploadDir}`);

    // ── Accounts ────────────────────────────────────────────────────
    const [studentHash, adminHash] = await Promise.all([
      bcrypt.hash(STUDENT_PASSWORD, 12),
      bcrypt.hash(ADMIN_PASSWORD, 12),
    ]);

    const student = await prisma.user.upsert({
      where: { email: STUDENT_EMAIL },
      update: {
        passwordHash: studentHash,
        fullName: 'Hana Bekele',
        role: 'STUDENT',
        isActive: true,
        isEmailVerified: true,
        phoneNumber: '+251911000111',
      },
      create: {
        email: STUDENT_EMAIL,
        passwordHash: studentHash,
        fullName: 'Hana Bekele',
        role: 'STUDENT',
        isActive: true,
        isEmailVerified: true,
        phoneNumber: '+251911000111',
      },
    });

    const admin = await prisma.user.upsert({
      where: { email: ADMIN_EMAIL },
      update: {
        passwordHash: adminHash,
        fullName: 'Dawit Tesfaye',
        role: 'SUPER_ADMIN',
        isActive: true,
        isEmailVerified: true,
      },
      create: {
        email: ADMIN_EMAIL,
        passwordHash: adminHash,
        fullName: 'Dawit Tesfaye',
        role: 'SUPER_ADMIN',
        isActive: true,
        isEmailVerified: true,
      },
    });

    // ── Wipe this student's support and payment history ────────────
    const oldAttachments = await prisma.supportAttachment.findMany({
      where: { message: { ticket: { userId: student.id } } },
      select: { storedName: true },
    });
    for (const attachment of oldAttachments) {
      await fs.promises.rm(
        path.join(uploadDir, path.basename(attachment.storedName)),
        { force: true },
      );
    }
    await prisma.supportInternalNote.deleteMany({
      where: { ticket: { userId: student.id } },
    });
    await prisma.supportMessage.deleteMany({
      where: { ticket: { userId: student.id } },
    });
    await prisma.supportTicket.deleteMany({ where: { userId: student.id } });
    await prisma.payment.deleteMany({ where: { userId: student.id } });
    await prisma.subscription.deleteMany({ where: { userId: student.id } });

    // ── Plan and subscription ───────────────────────────────────────
    const existingPlan = await prisma.subscriptionPlan.findFirst({
      where: { name: 'Lorcan Medical - 3 months' },
    });
    const plan =
      existingPlan ??
      (await prisma.subscriptionPlan.create({
        data: {
          name: 'Lorcan Medical - 3 months',
          description: 'Fixture plan for the help-centre screenshots.',
          priceETB: 1200,
          durationMonths: 3,
          isActive: true,
        },
      }));

    await prisma.subscription.create({
      data: {
        userId: student.id,
        planId: plan.id,
        status: 'ACTIVE',
        startDate: ago(20 * DAY),
        endDate: new Date(Date.now() + 70 * DAY),
      },
    });

    const planSnapshot = {
      planId: plan.id,
      amount: 1200,
      currency: 'ETB',
      planName: plan.name,
      planDurationMonths: 3,
    };

    // ── Payments in the states the UI treats differently ────────────
    const rejected = await prisma.payment.create({
      data: {
        ...planSnapshot,
        userId: student.id,
        method: 'MANUAL',
        status: 'REJECTED',
        receiptPath: 'fixtures/rejected-receipt.png',
        rejectionReason:
          'The amount on this receipt does not match the plan price.',
        createdAt: ago(6 * DAY),
      },
    });

    await prisma.payment.create({
      data: {
        ...planSnapshot,
        userId: student.id,
        method: 'CHAPA',
        status: 'EXPIRED',
        txRef: 'qa-expired-checkout',
        createdAt: ago(30 * DAY),
      },
    });

    const longPending = await prisma.payment.create({
      data: {
        ...planSnapshot,
        userId: student.id,
        method: 'MANUAL',
        status: 'PENDING',
        receiptPath: 'fixtures/pending-receipt.png',
        createdAt: ago(4 * DAY),
      },
    });

    await prisma.payment.create({
      data: {
        ...planSnapshot,
        userId: student.id,
        method: 'MANUAL',
        status: 'APPROVED',
        receiptNumber: 'RCP-QA-0001',
        bankName: 'CBE',
        bankReference: 'FT-QA-APPROVED-0001',
        reviewedBy: admin.id,
        reviewedAt: ago(40 * DAY),
        createdAt: ago(41 * DAY),
      },
    });

    // ── Attachment file for the first ticket ────────────────────────
    const image = await buildFixtureImage();
    const storedName = `${crypto.randomBytes(16).toString('hex')}.png`;
    await fs.promises.writeFile(path.join(uploadDir, storedName), image, {
      mode: 0o600,
    });

    // ── Tickets ─────────────────────────────────────────────────────
    const paymentTicket = await prisma.supportTicket.create({
      data: {
        userId: student.id,
        subject: 'My transfer is still marked pending',
        category: 'PAYMENT',
        status: 'OPEN',
        reference: 'FT-QA-LONGPENDING',
        paymentId: longPending.id,
        assignedToId: admin.id,
        createdAt: ago(4 * DAY),
        lastMessageAt: ago(3 * HOUR),
        lastStudentReadAt: ago(4 * DAY),
        lastStaffReadAt: ago(3 * HOUR),
        messages: {
          create: [
            {
              authorId: student.id,
              isStaff: false,
              createdAt: ago(4 * DAY),
              body: 'Good morning. I sent 1200 birr from CBE four days ago and attached the receipt. My account still says pending. Could you check whether the transfer reached you?',
              attachments: {
                create: {
                  storedName,
                  mimeType: 'image/png',
                  sizeBytes: image.length,
                  width: 800,
                  height: 450,
                  createdAt: ago(4 * DAY),
                },
              },
            },
            {
              authorId: admin.id,
              isStaff: true,
              createdAt: ago(3 * HOUR),
              body: 'Thank you for the receipt, Hana. We have your transfer in the review queue - it arrived on Thursday and the amount matches the plan. You do not need to pay again. We will approve it today and your access will extend automatically.',
            },
          ],
        },
      },
      include: { messages: true },
    });

    await prisma.supportInternalNote.create({
      data: {
        ticketId: paymentTicket.id,
        authorId: admin.id,
        createdAt: ago(2 * HOUR),
        body: 'Checked the CBE statement: FT-QA-LONGPENDING is a real credit of 1200.00 on the college account. Approve after the 10:00 reconciliation; no student action needed.',
      },
    });

    await prisma.supportTicket.create({
      data: {
        userId: student.id,
        subject: 'Anatomy model does not load on my phone',
        category: 'TECHNICAL',
        status: 'AWAITING_STUDENT',
        createdAt: ago(2 * DAY),
        lastMessageAt: ago(1 * DAY),
        lastStudentReadAt: ago(1 * DAY),
        lastStaffReadAt: ago(1 * DAY),
        messages: {
          create: [
            {
              authorId: student.id,
              isStaff: false,
              createdAt: ago(2 * DAY),
              body: 'The heart model stays on a grey screen in Chrome on Android. It works on my laptop. I have tried Wi-Fi and mobile data.',
            },
            {
              authorId: admin.id,
              isStaff: true,
              createdAt: ago(1 * DAY),
              body: 'That usually means the browser is holding an old version of the model file. Please clear site data for the app, or open it in a private tab, and tell me whether it loads. If it still fails, which Android version is the phone running?',
            },
          ],
        },
      },
    });

    await prisma.supportTicket.create({
      data: {
        userId: student.id,
        subject: 'Password reset email never arrives',
        category: 'ACCOUNT',
        status: 'RESOLVED',
        createdAt: ago(9 * DAY),
        lastMessageAt: ago(1 * DAY),
        lastStudentReadAt: ago(1 * DAY),
        lastStaffReadAt: ago(1 * DAY),
        resolvedAt: ago(1 * DAY),
        messages: {
          create: [
            {
              authorId: student.id,
              isStaff: false,
              createdAt: ago(9 * DAY),
              body: 'I asked for a reset link twice yesterday but nothing came. I checked spam and promotions.',
            },
            {
              authorId: admin.id,
              isStaff: true,
              createdAt: ago(1 * DAY),
              body: 'Your college address was on a suppression list after a bounced message. I have cleared it and sent a fresh reset link just now - it should arrive within a minute. Reply here if it does not and we will set it with you on the phone.',
            },
          ],
        },
      },
    });

    await prisma.supportTicket.create({
      data: {
        userId: student.id,
        subject: 'Can I download the pharmacology slides?',
        category: 'COURSE',
        status: 'CLOSED',
        createdAt: ago(20 * DAY),
        lastMessageAt: ago(14 * DAY),
        lastStudentReadAt: ago(14 * DAY),
        lastStaffReadAt: ago(14 * DAY),
        resolvedAt: ago(15 * DAY),
        closedAt: ago(14 * DAY),
        messages: {
          create: [
            {
              authorId: student.id,
              isStaff: false,
              createdAt: ago(20 * DAY),
              body: 'Are the lecture slides downloadable for offline study, or only viewable in the app?',
            },
            {
              authorId: admin.id,
              isStaff: true,
              createdAt: ago(14 * DAY),
              body: 'Each material has a download button under the viewer while your subscription is active. Downloads are for personal study only and are not to be shared outside the college.',
            },
          ],
        },
      },
    });

    await prisma.supportTicket.create({
      data: {
        userId: student.id,
        subject: 'Wrong receipt attached to my last payment',
        category: 'PAYMENT',
        status: 'OPEN',
        reference: 'RCP-QA-0001',
        createdAt: ago(1 * DAY),
        lastMessageAt: ago(1 * DAY),
        lastStudentReadAt: ago(1 * DAY),
        lastStaffReadAt: null,
        messages: {
          create: [
            {
              authorId: student.id,
              isStaff: false,
              createdAt: ago(1 * DAY),
              body: "I attached my cousin's receipt by mistake on an earlier attempt. My own transfer is FT-QA-APPROVED-0001. The approved payment RCP-QA-0001 on my account is the correct one. Please ignore the mistaken upload.",
            },
          ],
        },
      },
    });

    // ── Summary ─────────────────────────────────────────────────────
    const tickets = await prisma.supportTicket.findMany({
      where: { userId: student.id },
      orderBy: { number: 'asc' },
      select: { number: true, subject: true, status: true },
    });
    const format = (number: number) => `T-${String(number).padStart(6, '0')}`;

    console.log('');
    console.log('  Student:');
    console.log(`    email:    ${STUDENT_EMAIL}`);
    console.log(`    password: ${STUDENT_PASSWORD}`);
    console.log('  Staff:');
    console.log(`    email:    ${ADMIN_EMAIL}`);
    console.log(`    password: ${ADMIN_PASSWORD}`);
    console.log(`  Plan:     ${plan.name} (${plan.priceETB} ETB)`);
    console.log(`  Rejected payment: ${rejected.id}`);
    console.log(`  Long-pending payment: ${longPending.id}`);
    console.log(`  Attachment: ${storedName}`);
    console.log('');
    console.log('  Tickets:');
    for (const ticket of tickets) {
      console.log(
        `    ${format(ticket.number)}  ${ticket.status.padEnd(17)}${ticket.subject}`,
      );
    }
    console.log('');
    console.log(
      '  URLs: /support, /support/new, /support/tickets, /support/tickets/<id>, /admin/support, /admin/support/<id>',
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  console.error(
    'Support fixture seed failed:',
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
});
