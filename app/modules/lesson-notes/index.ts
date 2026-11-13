import { type NoteDraft, readDraft } from "./lib/draft";

export type { NoteDraft };

/**
 * What the Lesson page's Note form shows for the text in the box: the
 * character counter, whether there are unsaved changes, and whether Save is
 * worth pressing.
 */
export function describeNoteDraft(
  draft: string,
  savedBody: string | null
): NoteDraft {
  return readDraft(draft, savedBody);
}
