import {
  detectAllowedImageMime,
  isAllowedImageBuffer,
  isPdfBuffer,
} from './image-magic-bytes';

describe('image magic-byte detection', () => {
  it('detects JPEG, PNG, and WEBP by content rather than filename', () => {
    expect(detectAllowedImageMime(Buffer.from([0xff, 0xd8, 0xff, 0x00]))).toBe(
      'image/jpeg',
    );
    expect(
      detectAllowedImageMime(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toBe('image/png');
    expect(detectAllowedImageMime(Buffer.from('RIFF1234WEBP', 'ascii'))).toBe(
      'image/webp',
    );
  });

  it('rejects executable or empty content even when a client claims an image', () => {
    expect(isAllowedImageBuffer(Buffer.from('MZ executable', 'ascii'))).toBe(
      false,
    );
    expect(isAllowedImageBuffer(Buffer.alloc(0))).toBe(false);
  });

  it('recognizes a PDF header and rejects a near miss', () => {
    expect(isPdfBuffer(Buffer.from('%PDF-1.7', 'ascii'))).toBe(true);
    expect(isPdfBuffer(Buffer.from('PDF-1.7', 'ascii'))).toBe(false);
  });
});
