import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PDFParse } from 'pdf-parse';

@Injectable()
export class PdfExtractorService {
  private readonly logger = new Logger(PdfExtractorService.name);

  async extractText(filename: string): Promise<string> {
    const fullPath = path.join(process.cwd(), 'uploads', 'materials', filename);

    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found: ${filename}`);
    }

    const buffer = fs.readFileSync(fullPath);

    // pdf-parse v2 uses a class-based API — you create a parser
    // instance with the raw PDF bytes, then call getText() on it
    const parser = new PDFParse({ data: buffer });

    try {
      // pageJoiner: '' strips the default "-- page X of Y --" footer
      // pdf-parse appends after every page — we just want clean text
      const result = await parser.getText({ pageJoiner: '' });

      this.logger.log(
        `Extracted ${result.text.length} characters from ${filename}`,
      );

      return result.text;
    } finally {
      // Releases the underlying PDF document resources — matters
      // since this runs inside a long-lived background worker process
      // processing many PDFs over time, not a short-lived script
      await parser.destroy();
    }
  }
}
