import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "~/db/schema";
import { LessonProgressStatus } from "~/db/schema";
import { setUp, type Setup } from "./fixtures";

const NOW = new Date("2026-03-01T12:00:00.000Z");

let s: Setup;
beforeEach(() => {
  s = setUp();
});

function watch(lessonId: number, positionSeconds: number, createdAt: string) {
  s.db
    .insert(schema.videoWatchEvents)
    .values({
      userId: s.user.id,
      lessonId,
      eventType: "progress",
      positionSeconds,
      createdAt,
    })
    .run();
}

describe("lesson progress", () => {
  it("has none before the Student starts", () => {
    expect(
      s.page.getLessonProgress(s.user.id, s.lessons[0].id)
    ).toBeUndefined();
    expect(s.page.getLessonProgressForCourse(s.user.id, s.course.id)).toEqual(
      []
    );
  });

  it("marks a lesson in progress, then complete", () => {
    const lessonId = s.lessons[0].id;
    const started = s.page.markLessonInProgress(s.user.id, lessonId);
    expect(started.status).toBe(LessonProgressStatus.InProgress);
    expect(started.completedAt).toBeNull();

    const done = s.page.markLessonComplete(s.user.id, lessonId, NOW);
    expect(done.id).toBe(started.id);
    expect(done.status).toBe(LessonProgressStatus.Completed);
    expect(done.completedAt).toBe(NOW.toISOString());
    expect(s.page.getLessonProgress(s.user.id, lessonId)?.status).toBe(
      LessonProgressStatus.Completed
    );
  });

  it("completes a lesson the Student never started", () => {
    const done = s.page.markLessonComplete(s.user.id, s.lessons[1].id, NOW);
    expect(done.status).toBe(LessonProgressStatus.Completed);
    expect(done.completedAt).toBe(NOW.toISOString());
  });

  it("does not move a completed lesson back to in progress", () => {
    const lessonId = s.lessons[0].id;
    s.page.markLessonComplete(s.user.id, lessonId, NOW);
    expect(s.page.markLessonInProgress(s.user.id, lessonId).status).toBe(
      LessonProgressStatus.Completed
    );
  });

  it("keeps an in-progress lesson in progress when opened again", () => {
    const lessonId = s.lessons[0].id;
    const first = s.page.markLessonInProgress(s.user.id, lessonId);
    const again = s.page.markLessonInProgress(s.user.id, lessonId);
    expect(again.id).toBe(first.id);
    expect(again.status).toBe(LessonProgressStatus.InProgress);
  });

  it("leaves out progress on another course's lessons", () => {
    const other = s.db
      .insert(schema.courses)
      .values({
        title: "Other",
        slug: "other",
        description: "",
        salesCopy: s.course.salesCopy,
        instructorId: s.instructor.id,
        categoryId: s.category.id,
        status: schema.CourseStatus.Published,
      })
      .returning()
      .get();
    const otherModule = s.db
      .insert(schema.modules)
      .values({ courseId: other.id, title: "Other module", position: 1 })
      .returning()
      .get();
    const otherLesson = s.db
      .insert(schema.lessons)
      .values({ moduleId: otherModule.id, title: "Other lesson", position: 1 })
      .returning()
      .get();
    s.page.markLessonComplete(s.user.id, otherLesson.id, NOW);
    s.page.markLessonComplete(s.user.id, s.lessons[1].id, NOW);

    expect(
      s.page
        .getLessonProgressForCourse(s.user.id, s.course.id)
        .map((r) => r.lessonId)
    ).toEqual([s.lessons[1].id]);
  });

  it("lists progress for this Student in this course only", () => {
    s.page.markLessonComplete(s.user.id, s.lessons[0].id, NOW);
    s.page.markLessonInProgress(s.user.id, s.lessons[2].id);
    s.page.markLessonComplete(s.instructor.id, s.lessons[1].id, NOW);

    const rows = s.page.getLessonProgressForCourse(s.user.id, s.course.id);
    expect(rows.map((r) => r.lessonId).sort()).toEqual(
      [s.lessons[0].id, s.lessons[2].id].sort()
    );
  });

  it("has no progress for a course without modules or lessons", () => {
    const empty = s.db
      .insert(schema.courses)
      .values({
        title: "Empty",
        slug: "empty",
        description: "",
        salesCopy: s.course.salesCopy,
        instructorId: s.instructor.id,
        categoryId: s.category.id,
        status: schema.CourseStatus.Draft,
      })
      .returning()
      .get();
    s.page.markLessonComplete(s.user.id, s.lessons[0].id, NOW);
    expect(s.page.getLessonProgressForCourse(s.user.id, empty.id)).toEqual([]);

    s.db
      .insert(schema.modules)
      .values({ courseId: empty.id, title: "Nothing yet", position: 1 })
      .run();
    expect(s.page.getLessonProgressForCourse(s.user.id, empty.id)).toEqual([]);
  });
});

describe("watching the video", () => {
  it("starts at zero with no watch events", () => {
    expect(s.page.getLastWatchPosition(s.user.id, s.lessons[0].id)).toBe(0);
    expect(s.page.calculateWatchProgress(s.user.id, s.lessons[0].id, 100)).toBe(
      0
    );
  });

  it("resumes from the most recent event, not the furthest", () => {
    watch(s.lessons[0].id, 80, "2026-01-01T10:00:00.000Z");
    watch(s.lessons[0].id, 30, "2026-01-01T11:00:00.000Z");
    watch(s.lessons[1].id, 99, "2026-01-01T12:00:00.000Z");
    expect(s.page.getLastWatchPosition(s.user.id, s.lessons[0].id)).toBe(30);
  });

  it("measures progress from the furthest position, rounded", () => {
    watch(s.lessons[0].id, 80, "2026-01-01T10:00:00.000Z");
    watch(s.lessons[0].id, 30, "2026-01-01T11:00:00.000Z");
    expect(s.page.calculateWatchProgress(s.user.id, s.lessons[0].id, 120)).toBe(
      67
    );
  });

  it("caps progress at 100", () => {
    watch(s.lessons[0].id, 500, "2026-01-01T10:00:00.000Z");
    expect(s.page.calculateWatchProgress(s.user.id, s.lessons[0].id, 100)).toBe(
      100
    );
  });

  it("is zero for a video with no duration", () => {
    watch(s.lessons[0].id, 50, "2026-01-01T10:00:00.000Z");
    expect(s.page.calculateWatchProgress(s.user.id, s.lessons[0].id, 0)).toBe(
      0
    );
  });

  it("ignores another Student's watching", () => {
    s.db
      .insert(schema.videoWatchEvents)
      .values({
        userId: s.instructor.id,
        lessonId: s.lessons[0].id,
        eventType: "progress",
        positionSeconds: 50,
      })
      .run();
    expect(s.page.calculateWatchProgress(s.user.id, s.lessons[0].id, 100)).toBe(
      0
    );
    expect(s.page.getLastWatchPosition(s.user.id, s.lessons[0].id)).toBe(0);
  });
});
