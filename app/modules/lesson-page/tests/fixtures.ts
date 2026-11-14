import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { createLessonPage } from "../index.server";

/**
 * A course with two modules: "Basics" holds lessons 1 and 2, "Advanced"
 * holds lesson 3. Positions are inserted out of order to prove the sort.
 */
export function setUp() {
  const db = createTestDb();
  const base = seedBaseData(db);
  const insertModule = (title: string, position: number) =>
    db
      .insert(schema.modules)
      .values({ courseId: base.course.id, title, position })
      .returning()
      .get();
  const advanced = insertModule("Advanced", 2);
  const basics = insertModule("Basics", 1);
  const insertLesson = (moduleId: number, title: string, position: number) =>
    db
      .insert(schema.lessons)
      .values({ moduleId, title, position })
      .returning()
      .get();
  const lesson2 = insertLesson(basics.id, "Lesson 2", 2);
  const lesson1 = insertLesson(basics.id, "Lesson 1", 1);
  const lesson3 = insertLesson(advanced.id, "Lesson 3", 1);

  return {
    db,
    ...base,
    modules: { basics, advanced },
    lessons: [lesson1, lesson2, lesson3] as const,
    page: createLessonPage(db),
  };
}

export type Setup = ReturnType<typeof setUp>;

/** A quiz with one multiple-choice and one true/false question. */
export function addQuiz({ db, lessons }: Setup) {
  const quiz = db
    .insert(schema.quizzes)
    .values({ lessonId: lessons[0].id, title: "Check", passingScore: 0.7 })
    .returning()
    .get();
  const question = (
    questionText: string,
    questionType: schema.QuestionType,
    position: number
  ) =>
    db
      .insert(schema.quizQuestions)
      .values({ quizId: quiz.id, questionText, questionType, position })
      .returning()
      .get();
  const option = (questionId: number, optionText: string, isCorrect: boolean) =>
    db
      .insert(schema.quizOptions)
      .values({ questionId, optionText, isCorrect })
      .returning()
      .get();

  const trueFalse = question("Is TS typed?", schema.QuestionType.TrueFalse, 2);
  const tfFalse = option(trueFalse.id, "False", false);
  const tfTrue = option(trueFalse.id, "True", true);
  const choice = question("Pick one", schema.QuestionType.MultipleChoice, 1);
  const wrong = option(choice.id, "Wrong", false);
  const right = option(choice.id, "Right", true);

  return {
    quiz,
    choice: { question: choice, right, wrong },
    trueFalse: { question: trueFalse, right: tfTrue, wrong: tfFalse },
  };
}
