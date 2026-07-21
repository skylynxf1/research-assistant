import type { ReflowDocument } from "./reflow";

export type ReadingFont = "default" | "dyslexia-friendly";

export interface ReadingSettings {
  fontSize: number;
  lineHeight: number;
  paragraphSpacing: number;
  measure: number;
  highContrast: boolean;
  reducedMotion: boolean;
  font: ReadingFont;
}

export const DEFAULT_READING_SETTINGS: ReadingSettings = {
  fontSize: 17,
  lineHeight: 1.8,
  paragraphSpacing: 1.25,
  measure: 44,
  highContrast: false,
  reducedMotion: false,
  font: "default",
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

export function normalizeReadingSettings(
  settings: Partial<ReadingSettings>,
): ReadingSettings {
  return {
    ...DEFAULT_READING_SETTINGS,
    ...settings,
    fontSize: clamp(settings.fontSize ?? DEFAULT_READING_SETTINGS.fontSize, 14, 32),
    lineHeight: clamp(settings.lineHeight ?? DEFAULT_READING_SETTINGS.lineHeight, 1.2, 2.4),
    paragraphSpacing: clamp(
      settings.paragraphSpacing ?? DEFAULT_READING_SETTINGS.paragraphSpacing,
      0.5,
      3,
    ),
    measure: clamp(settings.measure ?? DEFAULT_READING_SETTINGS.measure, 28, 72),
  };
}

export function moveParagraphIndex(
  current: number,
  direction: -1 | 1,
  count: number,
): number {
  if (count <= 0) return 0;
  return clamp(current + direction, 0, count - 1);
}

export function speechParagraphs(document: ReflowDocument): string[] {
  if (document.status !== "ready") return [];
  return document.blocks.flatMap((block) => block.type === "paragraph" ? [block.text] : []);
}
