import { notesLengthTarget } from './gemini.service';

describe('notesLengthTarget', () => {
  it('scales the study-note length with the source document', () => {
    expect(notesLengthTarget(2_000)).toContain('200-350');
    expect(notesLengthTarget(10_000)).toContain('350-600');
    expect(notesLengthTarget(25_000)).toContain('600-950');
    expect(notesLengthTarget(45_000)).toContain('1,000-1,500');
    expect(notesLengthTarget(75_000)).toContain('1,400-1,900');
    expect(notesLengthTarget(150_000)).toContain('1,700-2,200');
  });

  it('keeps the largest target bounded for the JSON output budget', () => {
    expect(notesLengthTarget(10_000_000)).toBe(notesLengthTarget(150_000));
  });
});
