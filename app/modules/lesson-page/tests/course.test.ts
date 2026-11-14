import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "~/db/schema";
import { markdown } from "~/lib/text";
import { flattenCourseLessons } from "../index.server";
import { setUp, type Setup } from "./fixtures";

let s: Setup;
beforeEach(() => {
  s = setUp();
});

describe("the course around a lesson", () => {
  it("returns the course with its instructor, category, and ordered curriculum", () => {
    const course = s.page.getCourseWithDetails(s.course.id);
    expect(course).toMatchObject({
      id: s.course.id,
      slug: "test-course",
      instructorName: "Test Instructor",
      categoryName: "Programming",
    });
    expect(course?.modules.map((m) => m.title)).toEqual(["Basics", "Advanced"]);
    expect(course?.modules[0].lessons.map((l) => l.title)).toEqual([
      "Lesson 1",
      "Lesson 2",
    ]);
    expect(course?.modules[1].lessons.map((l) => l.title)).toEqual([
      "Lesson 3",
    ]);
  });

  it("returns null for an unknown course", () => {
    expect(s.page.getCourseWithDetails(s.course.id + 100)).toBeNull();
  });

  it("returns a course with no modules", () => {
    const empty = s.db
      .insert(schema.courses)
      .values({
        title: "Empty",
        slug: "empty",
        description: "",
        salesCopy: markdown(""),
        instructorId: s.instructor.id,
        categoryId: s.category.id,
        status: schema.CourseStatus.Draft,
      })
      .returning()
      .get();
    expect(s.page.getCourseWithDetails(empty.id)?.modules).toEqual([]);
  });

  it("finds a lesson, a module, a user, and the course a lesson is in", () => {
    expect(s.page.getLessonById(s.lessons[1].id)?.title).toBe("Lesson 2");
    expect(s.page.getLessonById(9999)).toBeUndefined();
    expect(s.page.getModuleById(s.modules.advanced.id)?.title).toBe("Advanced");
    expect(s.page.getModuleById(9999)).toBeUndefined();
    expect(s.page.getUserById(s.user.id)?.name).toBe("Test User");
    expect(s.page.getUserById(9999)).toBeUndefined();
    expect(s.page.getCourseForLesson(s.lessons[2].id)).toEqual({
      courseId: s.course.id,
      courseTitle: "Test Course",
      courseSlug: "test-course",
      instructorId: s.instructor.id,
    });
    expect(s.page.getCourseForLesson(9999)).toBeUndefined();
  });
});

describe("flattenCourseLessons", () => {
  it("lists every lesson in curriculum order with its module", () => {
    const course = s.page.getCourseWithDetails(s.course.id);
    if (!course) throw new Error("course missing");
    expect(flattenCourseLessons(course)).toEqual([
      {
        id: s.lessons[0].id,
        title: "Lesson 1",
        moduleId: s.modules.basics.id,
        moduleTitle: "Basics",
      },
      {
        id: s.lessons[1].id,
        title: "Lesson 2",
        moduleId: s.modules.basics.id,
        moduleTitle: "Basics",
      },
      {
        id: s.lessons[2].id,
        title: "Lesson 3",
        moduleId: s.modules.advanced.id,
        moduleTitle: "Advanced",
      },
    ]);
  });
});
