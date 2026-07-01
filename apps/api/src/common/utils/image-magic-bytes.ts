import { BadRequestException } from '@nestjs/common';
import * as fs from 'fs';

/**
 * Content-based image validation.
 *
 * Multer's fileFilter only sees the client-supplied MIME type, which is trivial
 * to spoof (rename evil.exe → evil.jpg). This reads the file's real leading
 * bytes ("magic numbers") and confirms it is genuinely a JPEG, PNG, or WEBP.
 */
function hasJpegSignature(buf: Buffer): boolean {
  // FF D8 FF
  return (
    buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff
  );
}

function hasPngSignature(buf: Buffer): boolean {
  // 89 50 4E 47 0D 0A 1A 0A
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return buf.length >= 8 && sig.every((b, i) => buf[i] === b);
}

function hasWebpSignature(buf: Buffer): boolean {
  // "RIFF" .... "WEBP"
  return (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  );
}

export function isAllowedImageBuffer(buf: Buffer): boolean {
  return hasJpegSignature(buf) || hasPngSignature(buf) || hasWebpSignature(buf);
}

/**
 * Validate an already-uploaded file on disk. If it isn't a real JPEG/PNG/WEBP,
 * the file is deleted and a BadRequestException is thrown — so a rejected upload
 * never lingers in the uploads directory.
 */
export function assertValidImageFile(filePath: string): void {
  let fd: number | undefined;
  let valid = false;
  try {
    fd = fs.openSync(filePath, 'r');
    const header = Buffer.alloc(12);
    fs.readSync(fd, header, 0, 12, 0);
    valid = isAllowedImageBuffer(header);
  } catch {
    valid = false;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }

  if (!valid) {
    fs.rm(filePath, { force: true }, () => undefined);
    throw new BadRequestException(
      'Uploaded file is not a valid JPEG, PNG, or WEBP image',
    );
  }
}
