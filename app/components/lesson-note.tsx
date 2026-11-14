import { useState } from "react";
import { useFetcher } from "react-router";
import { Lock, NotebookPen } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Textarea } from "~/components/ui/textarea";
import { cn, formatRelativeTime } from "~/lib/utils";
import { describeNoteDraft } from "~/modules/lesson-notes";

export type SavedNote = { body: string; updatedAt: string } | null;

/**
 * The Student's private Note on a Lesson. Give it `key={lessonId}` so the
 * draft starts again on the next Lesson.
 */
export function LessonNote({ note }: { note: SavedNote }) {
  const fetcher = useFetcher<{ ok: boolean; error?: string }>();
  const [body, setBody] = useState(note?.body ?? "");
  const isSaving = fetcher.state !== "idle";
  const error = fetcher.data?.error;
  const draft = describeNoteDraft(body, note?.body ?? null);

  return (
    <Card className="mb-8 py-0">
      <CardContent className="p-6">
        <NoteHeading />

        <fetcher.Form method="post" className="space-y-2">
          <input type="hidden" name="intent" value="save-note" />
          <Textarea
            name="body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Key ideas, questions to come back to, timestamps worth rewatching..."
            aria-label="Your notes"
            className="min-h-32 resize-y"
          />

          <div className="flex items-center gap-3">
            <Button
              type="submit"
              size="sm"
              disabled={isSaving || !draft.canSave}
            >
              {isSaving ? "Saving..." : "Save note"}
            </Button>
            <NoteStatus
              error={error}
              unsaved={draft.unsaved}
              updatedAt={note?.updatedAt}
            />
            <span
              className={cn(
                "ml-auto text-xs",
                draft.tooLong ? "text-destructive" : "text-muted-foreground"
              )}
            >
              {draft.length} / {draft.max}
            </span>
          </div>
        </fetcher.Form>
      </CardContent>
    </Card>
  );
}

function NoteStatus({
  error,
  unsaved,
  updatedAt,
}: {
  error: string | undefined;
  unsaved: boolean;
  updatedAt: string | undefined;
}) {
  if (error) return <span className="text-sm text-destructive">{error}</span>;
  if (unsaved) {
    return (
      <span className="text-xs text-muted-foreground">Unsaved changes</span>
    );
  }
  if (!updatedAt) return null;
  return (
    <span suppressHydrationWarning className="text-xs text-muted-foreground">
      Saved · last edited {formatRelativeTime(updatedAt)}
    </span>
  );
}

function NoteHeading() {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2">
          <NotebookPen className="size-5 text-primary" />
          <h2 className="text-xl font-semibold">Your notes</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Jot down what you want to remember from this lesson.
        </p>
      </div>
      <span className="flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground">
        <Lock className="size-3" />
        Private
      </span>
    </div>
  );
}
