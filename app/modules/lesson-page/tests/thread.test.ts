import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import { markdown } from "~/lib/text";
import { renderThread } from "../index.server";
import { setUp, type Setup } from "./fixtures";

let s: Setup;
let lessonId: number;
beforeEach(() => {
  s = setUp();
  lessonId = s.lessons[0].id;
});

type Post = Partial<typeof schema.comments.$inferInsert> & {
  createdAt: string;
};

function post(userId: number, body: string, extra: Post) {
  return s.db
    .insert(schema.comments)
    .values({ lessonId, userId, body: markdown(body), ...extra })
    .returning()
    .get();
}

describe("the Discussion thread", () => {
  it("is empty for a lesson nobody has asked about", () => {
    expect(s.page.getLessonThread(lessonId)).toEqual([]);
    expect(s.page.getLessonThread(9999)).toEqual([]);
  });

  it("nests replies under their question, oldest first", () => {
    const later = post(s.user.id, "Second question", {
      createdAt: "2026-01-02T00:00:00Z",
    });
    const first = post(s.user.id, "First question", {
      createdAt: "2026-01-01T00:00:00Z",
      editedAt: "2026-01-01T01:00:00Z",
    });
    post(s.instructor.id, "An answer", {
      createdAt: "2026-01-03T00:00:00Z",
      parentId: first.id,
    });

    const thread = s.page.getLessonThread(lessonId);
    expect(thread.map((c) => c.id)).toEqual([first.id, later.id]);
    expect(thread[0]).toMatchObject({
      body: "First question",
      editedAt: "2026-01-01T01:00:00Z",
      deleted: false,
      author: {
        id: s.user.id,
        name: "Test User",
        isInstructor: false,
        isPlatformAdmin: false,
      },
    });
    expect(thread[0].replies).toHaveLength(1);
    expect(thread[0].replies[0]).toMatchObject({
      body: "An answer",
      author: { id: s.instructor.id, isInstructor: true },
      replies: [],
    });
    expect(thread[1].replies).toEqual([]);
  });

  it("leaves out a reply to a reply, since the thread is one level deep", () => {
    const question = post(s.user.id, "Question", {
      createdAt: "2026-01-01T00:00:00Z",
    });
    const answer = post(s.instructor.id, "Answer", {
      createdAt: "2026-01-02T00:00:00Z",
      parentId: question.id,
    });
    post(s.user.id, "Reply to the answer", {
      createdAt: "2026-01-03T00:00:00Z",
      parentId: answer.id,
    });

    const thread = s.page.getLessonThread(lessonId);
    expect(thread).toHaveLength(1);
    expect(thread[0].replies.map((r) => r.id)).toEqual([answer.id]);
  });

  it("flags a Platform Admin author", () => {
    const admin = s.db
      .insert(schema.users)
      .values({ name: "Admin", email: "a@example.com", role: UserRole.Admin })
      .returning()
      .get();
    post(admin.id, "Hello", { createdAt: "2026-01-01T00:00:00Z" });
    expect(s.page.getLessonThread(lessonId)[0].author.isPlatformAdmin).toBe(
      true
    );
  });

  it("blanks a deleted question but keeps its replies", () => {
    const question = post(s.user.id, "Secret", {
      createdAt: "2026-01-01T00:00:00Z",
      deletedAt: "2026-01-05T00:00:00Z",
      editedAt: "2026-01-02T00:00:00Z",
    });
    post(s.instructor.id, "Reply", {
      createdAt: "2026-01-03T00:00:00Z",
      parentId: question.id,
    });

    const [shown] = s.page.getLessonThread(lessonId);
    expect(shown).toMatchObject({ body: "", editedAt: null, deleted: true });
    expect(shown.replies.map((r) => r.body)).toEqual(["Reply"]);
  });

  it("drops a deleted question with no replies left, and deleted replies", () => {
    const question = post(s.user.id, "Gone", {
      createdAt: "2026-01-01T00:00:00Z",
      deletedAt: "2026-01-05T00:00:00Z",
    });
    post(s.instructor.id, "Also gone", {
      createdAt: "2026-01-03T00:00:00Z",
      parentId: question.id,
      deletedAt: "2026-01-04T00:00:00Z",
    });
    expect(s.page.getLessonThread(lessonId)).toEqual([]);
  });

  it("only shows this lesson's comments", () => {
    s.db
      .insert(schema.comments)
      .values({
        lessonId: s.lessons[1].id,
        userId: s.user.id,
        body: markdown("Elsewhere"),
      })
      .run();
    expect(s.page.getLessonThread(lessonId)).toEqual([]);
  });

  it("finds a comment by id", () => {
    const comment = post(s.user.id, "Find me", {
      createdAt: "2026-01-01T00:00:00Z",
    });
    expect(s.page.getCommentById(comment.id)?.body).toBe("Find me");
    expect(s.page.getCommentById(9999)).toBeUndefined();
  });
});

describe("renderThread", () => {
  it("renders bodies to HTML, escaping raw HTML, and leaves deleted ones blank", async () => {
    const question = post(s.user.id, "**bold** <b>raw</b>", {
      createdAt: "2026-01-01T00:00:00Z",
    });
    post(s.instructor.id, "_reply_", {
      createdAt: "2026-01-02T00:00:00Z",
      parentId: question.id,
    });
    const gone = post(s.user.id, "x", {
      createdAt: "2026-01-03T00:00:00Z",
      deletedAt: "2026-01-04T00:00:00Z",
    });
    post(s.user.id, "kept", {
      createdAt: "2026-01-05T00:00:00Z",
      parentId: gone.id,
    });

    const rendered = await renderThread(s.page.getLessonThread(lessonId));
    expect(rendered[0].bodyHtml).toContain("<strong>bold</strong>");
    expect(rendered[0].bodyHtml).not.toContain("<b>raw</b>");
    expect(rendered[0].replies[0].bodyHtml).toContain("<em>reply</em>");
    expect(rendered[1].bodyHtml).toBe("");
    expect(rendered[1].replies[0].bodyHtml).toContain("kept");
  });
});
