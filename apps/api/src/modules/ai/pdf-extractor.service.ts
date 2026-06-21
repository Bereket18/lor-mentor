import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

// Define the structural interface that pdf-parse returns
interface PdfParseResult {
  text: string;
  numpages: number;
  numrender: number;
  info: Record<string, unknown>;
  metadata: unknown;
  version: string;
}

// pdf-parse has no clean TypeScript types for its default export
// behavior, so a dynamic require is the accepted pattern for this
// specific package
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (buffer: Buffer) => Promise<any>;

@Injectable()
export class PdfExtractorService {
  private readonly logger = new Logger(PdfExtractorService.name);

  // filename here matches Material.filePath exactly — just the random
  // hex filename, not a full path. We rebuild the full path ourselves
  // using the same uploadDir convention as MaterialsService.
  async extractText(filename: string): Promise<string> {
    const fullPath = path.join(process.cwd(), 'uploads', 'materials', filename);

    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found: ${filename}`);
    }

    const buffer = fs.readFileSync(fullPath);

    // ✨ Cast the unresolved promise response to your explicit interface
    const data = (await pdfParse(buffer)) as PdfParseResult;

    // ✨ Safe member access: TypeScript knows data.text is a valid string
    this.logger.log(
      `Extracted ${data.text.length} characters from ${filename}`,
    );

    return data.text;
  }
}
