import { describe, expect, it } from "vitest";
import { describeNoteDraft } from "../index";
import { MAX_NOTE_LENGTH } from "~/lib/notes";

describe("describeNoteDraft", () => {
  it("cannot save an empty box when there is no Note yet", () => {
    expect(describeNoteDraft("", null)).toEqual({
      length: 0,
      max: MAX_NOTE_LENGTH,
      tooLong: false,
      empty: true,
      unsaved: false,
      canSave: false,
    });
  });

  it("treats whitespace as empty, and does not count it", () => {
    const draft = describeNoteDraft("   \n ", null);
    expect(draft.empty).toBe(true);
    expect(draft.length).toBe(0);
    expect(draft.canSave).toBe(false);
  });

  it("can save new text when there is no Note yet", () => {
    const draft = describeNoteDraft("Generics are like functions", null);
    expect(draft).toMatchObject({
      length: 27,
      empty: false,
      unsaved: true,
      canSave: true,
    });
  });

  it("has nothing to save when the box matches the saved Note", () => {
    const draft = describeNoteDraft("My note", "My note");
    expect(draft.unsaved).toBe(false);
    expect(draft.canSave).toBe(false);
  });

  it("ignores surrounding whitespace when comparing with the saved Note", () => {
    expect(describeNoteDraft("  My note\n", "My note").unsaved).toBe(false);
  });

  it("can save an edit to the saved Note", () => {
    const draft = describeNoteDraft("My note, edited", "My note");
    expect(draft.unsaved).toBe(true);
    expect(draft.canSave).toBe(true);
  });

  it("flags clearing a saved Note as unsaved, but not saveable", () => {
    const draft = describeNoteDraft("", "My note");
    expect(draft.unsaved).toBe(true);
    expect(draft.empty).toBe(true);
    expect(draft.canSave).toBe(false);
  });

  it("allows exactly the maximum length", () => {
    const draft = describeNoteDraft("a".repeat(MAX_NOTE_LENGTH), null);
    expect(draft.tooLong).toBe(false);
    expect(draft.canSave).toBe(true);
  });

  it("refuses one character over the maximum", () => {
    const draft = describeNoteDraft("a".repeat(MAX_NOTE_LENGTH + 1), null);
    expect(draft.tooLong).toBe(true);
    expect(draft.length).toBe(MAX_NOTE_LENGTH + 1);
    expect(draft.canSave).toBe(false);
  });

  it("measures the limit after trimming, as the server does", () => {
    const draft = describeNoteDraft(` ${"a".repeat(MAX_NOTE_LENGTH)} `, null);
    expect(draft.length).toBe(MAX_NOTE_LENGTH);
    expect(draft.tooLong).toBe(false);
    expect(draft.canSave).toBe(true);
  });
});
