import { z } from 'zod';

export const LanguageCodeSchema = z.enum([
  'en',
  'hi',
  'kn',
  'ta',
  'te',
  'mr',
  'bn',
  'ml',
  'gu',
  'pa',
]);
export type LanguageCode = z.infer<typeof LanguageCodeSchema>;

export const ScriptSchema = z.enum([
  'latin',
  'devanagari',
  'kannada',
  'tamil',
  'telugu',
  'malayalam',
  'gurmukhi',
  'gujarati',
  'bengali',
]);
export type Script = z.infer<typeof ScriptSchema>;

export const LanguageConfigSchema = z.object({
  code: LanguageCodeSchema,
  name: z.string().min(1),
  proficiency: z.enum(['primary', 'secondary']),
  script: ScriptSchema.optional(),
});
export type LanguageConfig = z.infer<typeof LanguageConfigSchema>;
