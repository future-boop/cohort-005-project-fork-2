import { MAX_NOTE_LENGTH } from "~/lib/notes";

export type NoteDraft = {
  /** Characters that will be saved, for the counter. */
  length: number;
  max: number;
  tooLong: boolean;
  empty: boolean;
  /** The draft differs from the saved Note (or there is none and it has text). */
  unsaved: boolean;
  canSave: boolean;
};

// The server trims before it checks and stores a Note, so the form trims the
// draft too: otherwise it would disagree with the save result. The saved body
// is already trimmed.
export function readDraft(draft: string, savedBody: string | null): NoteDraft {
  const trimmed = draft.trim();
  const empty = trimmed.length === 0;
  const tooLong = trimmed.length > MAX_NOTE_LENGTH;
  const unsaved = trimmed !== (savedBody ?? "");
  return {
    length: trimmed.length,
    max: MAX_NOTE_LENGTH,
    tooLong,
    empty,
    unsaved,
    canSave: unsaved && !empty && !tooLong,
  };
}
