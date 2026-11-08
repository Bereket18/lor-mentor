import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Data needed to render a payment receipt. Kept provider-agnostic so the same
 * receipt is produced whether the payment was approved automatically (Chapa)
 * or manually by an admin.
 */
export interface ReceiptData {
  receiptNumber: string;
  paidAt: Date;
  method: 'MANUAL' | 'CHAPA';
  /** Pre-formatted decimal string (2 decimals) — never a JS float on money. */
  amount: string;
  currency: string;
  chapaRef?: string | null;
  payer: { fullName: string; email: string; phoneNumber?: string | null };
  plan: { name: string; durationMonths: number };
  subscription: { startDate: Date; endDate: Date };
}

/**
 * Dates on a receipt are entitlement instants stored in UTC. They are always
 * rendered in Addis Ababa time (UTC+3, no DST) because that is where the
 * college and its students are: leaving the timezone implicit made the same
 * receipt print different days on a UTC API host and a developer machine.
 */
export const RECEIPT_TIME_ZONE = 'Africa/Addis_Ababa';

/** `dd/mm/yyyy`, optionally `dd/mm/yyyy, HH:mm` — always Addis Ababa time. */
export function formatReceiptDate(value: Date, withTime = false): string {
  const options: Intl.DateTimeFormatOptions = {
    timeZone: RECEIPT_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  };
  if (withTime) {
    return value.toLocaleString('en-GB', {
      ...options,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }
  return value.toLocaleDateString('en-GB', options);
}

/**
 * Generates branded PDF receipts and serves them back. Receipts live under
 * uploads/receipts-generated/<paymentId>.pdf and are produced once, the moment
 * a payment becomes APPROVED.
 */
@Injectable()
export class ReceiptService {
  private readonly dir = path.join(
    process.cwd(),
    'uploads',
    'receipts-generated',
  );

  constructor(private readonly config: ConfigService) {
    if (!fs.existsSync(this.dir)) {
      fs.mkdirSync(this.dir, { recursive: true });
    }
  }

  /**
   * Stable, human-facing receipt number derived from the payment id so the
   * same payment always maps to the same number (idempotent on webhook retry).
   */
  buildReceiptNumber(paymentId: string, when: Date): string {
    // The year belongs on the college's calendar, not the API host's.
    // Production runs in UTC, where 21:30Z on 31 Dec is still 2026 - but the
    // receipt it prints (in Addis time) says 1 Jan 2027. Deriving the year in
    // the same zone as the printed dates keeps the number and the receipt
    // consistent.
    const year = new Intl.DateTimeFormat('en-GB', {
      timeZone: RECEIPT_TIME_ZONE,
      year: 'numeric',
    }).format(when);
    return `LM-${year}-${paymentId.slice(-8).toUpperCase()}`;
  }

  fileNameFor(paymentId: string): string {
    return `${paymentId}.pdf`;
  }

  /** Whether the generated PDF for this payment is currently on disk. */
  exists(paymentId: string): boolean {
    return fs.existsSync(path.join(this.dir, this.fileNameFor(paymentId)));
  }

  /** Absolute path + existence check for serving a previously generated PDF. */
  resolveExisting(paymentId: string): string {
    const full = path.join(this.dir, this.fileNameFor(paymentId));
    if (!fs.existsSync(full)) {
      throw new NotFoundException('Receipt has not been generated yet');
    }
    return full;
  }

  /**
   * Render the PDF to disk. Resolves with the stored filename once the file is
   * fully flushed. Safe to call again — it simply overwrites the same file.
   */
  async generate(paymentId: string, data: ReceiptData): Promise<string> {
    const fileName = this.fileNameFor(paymentId);
    const fullPath = path.join(this.dir, fileName);

    const college =
      this.config.get<string>('COLLEGE_NAME') ?? 'Lorcan Medical College';
    const brand = this.config.get<string>('APP_NAME') ?? 'Lor Mentor';

    await new Promise<void>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const stream = fs.createWriteStream(fullPath);
      stream.on('finish', resolve);
      stream.on('error', reject);
      doc.on('error', reject);
      doc.pipe(stream);

      const teal = '#14B8A6';
      const ink = '#0F172A';
      const muted = '#64748B';

      // ── Header band ──
      doc.rect(0, 0, doc.page.width, 110).fill(teal);
      doc
        .fillColor('#FFFFFF')
        .fontSize(22)
        .font('Helvetica-Bold')
        .text(college, 50, 38);
      doc
        .fontSize(11)
        .font('Helvetica')
        .fillColor('#E6FFFA')
        .text(`${brand} — Official Payment Receipt`, 50, 68);

      doc.fillColor(ink);
      let y = 140;

      // ── Receipt meta ──
      doc.fontSize(16).font('Helvetica-Bold').text('Payment Receipt', 50, y);
      doc
        .fontSize(10)
        .font('Helvetica')
        .fillColor(muted)
        .text(`Receipt No.  ${data.receiptNumber}`, 50, y + 24)
        .text(`Date  ${formatReceiptDate(data.paidAt, true)}`, 50, y + 40)
        .text(
          `Method  ${data.method === 'CHAPA' ? 'Chapa (online)' : 'Bank transfer (manual)'}`,
          50,
          y + 56,
        );
      if (data.chapaRef) {
        doc.text(`Transaction Ref  ${data.chapaRef}`, 50, y + 72);
      }

      // ── Status badge ──
      doc
        .roundedRect(420, y, 130, 30, 6)
        .fill('#10B981')
        .fillColor('#FFFFFF')
        .fontSize(12)
        .font('Helvetica-Bold')
        .text('PAID', 420, y + 9, { width: 130, align: 'center' });

      doc.fillColor(ink);
      y += 110;

      // ── Billed to ──
      doc.fontSize(11).font('Helvetica-Bold').text('Billed to', 50, y);
      doc
        .font('Helvetica')
        .fillColor(muted)
        .fontSize(10)
        .text(data.payer.fullName, 50, y + 16)
        .text(data.payer.email, 50, y + 30);
      if (data.payer.phoneNumber) {
        doc.text(data.payer.phoneNumber, 50, y + 44);
      }

      doc.fillColor(ink);
      y += 90;

      // ── Line item table ──
      doc.rect(50, y, 500, 28).fill('#F1F5F9').fillColor(ink);
      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .text('Description', 60, y + 9)
        .text('Period', 300, y + 9)
        .text('Amount', 60, y + 9, { width: 480, align: 'right' });

      y += 28;
      const period = `${formatReceiptDate(data.subscription.startDate)} – ${formatReceiptDate(data.subscription.endDate)}`;
      doc
        .font('Helvetica')
        .fillColor(ink)
        .text(`${data.plan.name} subscription`, 60, y + 10)
        .fillColor(muted)
        .text(period, 300, y + 10)
        .fillColor(ink)
        .text(`${data.amount} ${data.currency}`, 60, y + 10, {
          width: 480,
          align: 'right',
        });

      y += 44;
      doc.moveTo(50, y).lineTo(550, y).strokeColor('#E2E8F0').stroke();
      y += 12;
      doc
        .fontSize(13)
        .font('Helvetica-Bold')
        .fillColor(ink)
        .text('Total paid', 60, y)
        .fillColor(teal)
        .text(`${data.amount} ${data.currency}`, 60, y, {
          width: 480,
          align: 'right',
        });

      // ── Footer ──
      doc
        .fontSize(9)
        .font('Helvetica')
        .fillColor(muted)
        .text(
          'This receipt was generated automatically and is valid without a signature. ' +
            'Keep it for your records. For questions, contact the college administration.',
          50,
          doc.page.height - 90,
          { width: 500 },
        );

      doc.end();
    });

    return fileName;
  }
}
