import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

// The exact shape we expect back from Gemini for one piece of material.
// Defining this upfront means TypeScript catches it immediately if
// something downstream tries to use a field that doesn't exist.
export interface GeneratedAiContent {
  summary: string;
  keyTopics: string[];
  flashcards: { front: string; back: string }[];
  questions: {
    text: string;
    options: string[];
    correctOption: string;
    explanation: string;
  }[];
}

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private readonly client: GoogleGenerativeAI;

  constructor(private readonly config: ConfigService) {
    this.client = new GoogleGenerativeAI(
      this.config.get<string>('GEMINI_API_KEY')!,
    );
  }

  // One call generates everything — summary, topics, flashcards, and
  // quiz questions together. This is cheaper than four separate calls
  // and keeps everything thematically consistent (the flashcards and
  // quiz reference the same key topics the summary identified).
  async generateFromText(materialText: string): Promise<GeneratedAiContent> {
    // Gemini has a context limit. Rather than fail outright on a very
    // long PDF, we truncate to a safe size and process what we can.
    const truncated = materialText.slice(0, 40_000);

    const model = this.client.getGenerativeModel({
      // Check Google AI Studio for the current recommended Flash model
      // name when you actually run this — the lineup changes often
      model: 'gemini-2.5-flash',
    });

    const prompt = `
You are an expert medical education assistant creating study material
for a medical student from a course PDF. Read the material below and
respond with ONLY valid JSON — no markdown formatting, no code fences,
no explanation text before or after. Match this exact shape:

{
  "summary": "A clear 3-paragraph summary written for a medical student studying for an exam",
  "keyTopics": ["topic 1", "topic 2", "topic 3"],
  "flashcards": [
    { "front": "question or term", "back": "concise answer or definition" }
  ],
  "questions": [
    {
      "text": "a multiple choice question testing understanding of the material",
      "options": ["option A", "option B", "option C", "option D"],
      "correctOption": "the exact text of the correct option from above",
      "explanation": "why this answer is correct, 1-2 sentences"
    }
  ]
}

Generate exactly 5-8 keyTopics, 15-20 flashcards, and 8-10 questions.
Every question must have exactly 4 options.

MATERIAL:
${truncated}
    `.trim();

    try {
      const result = await model.generateContent(prompt);
      const rawText = result.response.text();

      // Gemini sometimes wraps JSON in markdown code fences even when
      // explicitly told not to — strip them defensively before parsing
      const cleaned = rawText.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned) as GeneratedAiContent;

      // Basic shape check — if Gemini returns something malformed we
      // want a clear thrown error here, not a silent half-broken save
      // three steps later in the pipeline
      if (
        !parsed.summary ||
        !Array.isArray(parsed.flashcards) ||
        !Array.isArray(parsed.questions)
      ) {
        throw new Error('Gemini response did not match the expected shape');
      }

      return parsed;
    } catch (error) {
      this.logger.error('Gemini generation failed', error);
      throw error;
    }
  }
}
