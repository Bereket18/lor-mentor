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
  amount: number;
  currency: string;
  chapaRef?: string | null;
  payer: { fullName: string; email: string; phoneNumber?: string | null };
  plan: { name: string; durationMonths: number };
  subscription: { startDate: Date; endDate: Date };
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
    const year = when.getFullYear();
    return `LM-${year}-${paymentId.slice(-8).toUpperCase()}`;
  }

  fileNameFor(paymentId: string): string {
    return `${paymentId}.pdf`;
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
        .text(`Date  ${data.paidAt.toLocaleString()}`, 50, y + 40)
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
      const period = `${data.subscription.startDate.toLocaleDateString()} – ${data.subscription.endDate.toLocaleDateString()}`;
      doc
        .font('Helvetica')
        .fillColor(ink)
        .text(`${data.plan.name} subscription`, 60, y + 10)
        .fillColor(muted)
        .text(period, 300, y + 10)
        .fillColor(ink)
        .text(
          `${data.amount.toLocaleString()} ${data.currency}`,
          60,
          y + 10,
          { width: 480, align: 'right' },
        );

      y += 44;
      doc.moveTo(50, y).lineTo(550, y).strokeColor('#E2E8F0').stroke();
      y += 12;
      doc
        .fontSize(13)
        .font('Helvetica-Bold')
        .fillColor(ink)
        .text('Total paid', 60, y)
        .fillColor(teal)
        .text(
          `${data.amount.toLocaleString()} ${data.currency}`,
          60,
          y,
          { width: 480, align: 'right' },
        );

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
