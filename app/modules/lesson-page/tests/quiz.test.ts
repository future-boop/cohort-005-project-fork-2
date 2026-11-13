import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "~/db/schema";
import { calculateGrade } from "../index.server";
import { addQuiz, setUp, type Setup } from "./fixtures";

let s: Setup;
let q: ReturnType<typeof addQuiz>;
beforeEach(() => {
  s = setUp();
  q = addQuiz(s);
});

describe("calculateGrade", () => {
  it.each([
    [1, "A"],
    [0.9, "A"],
    [0.89, "B"],
    [0.8, "B"],
    [0.79, "C"],
    [0.7, "C"],
    [0.69, "D"],
    [0.6, "D"],
    [0.59, "F"],
    [0, "F"],
  ])("grades %s as %s", (score, grade) => {
    expect(calculateGrade(score)).toBe(grade);
  });
});

describe("reading a quiz", () => {
  it("finds the quiz by id and by lesson", () => {
    expect(s.page.getQuizById(q.quiz.id)?.title).toBe("Check");
    expect(s.page.getQuizById(q.quiz.id + 1)).toBeUndefined();
    expect(s.page.getQuizByLessonId(s.lessons[0].id)?.id).toBe(q.quiz.id);
    expect(s.page.getQuizByLessonId(s.lessons[1].id)).toBeUndefined();
  });

  it("returns the questions in position order, each with its options", () => {
    const quiz = s.page.getQuizWithQuestions(q.quiz.id);
    expect(quiz?.title).toBe("Check");
    expect(quiz?.questions.map((x) => x.questionText)).toEqual([
      "Pick one",
      "Is TS typed?",
    ]);
    expect(quiz?.questions[0].options.map((o) => o.optionText)).toEqual([
      "Wrong",
      "Right",
    ]);
    expect(quiz?.questions[1].options.map((o) => o.optionText)).toEqual([
      "False",
      "True",
    ]);
  });

  it("returns null for an unknown quiz", () => {
    expect(s.page.getQuizWithQuestions(q.quiz.id + 1)).toBeNull();
  });
});

describe("submitting a quiz", () => {
  it("scores every answer right as a pass, and records the attempt", () => {
    const result = s.page.computeResult(s.user.id, q.quiz.id, {
      [q.choice.question.id]: q.choice.right.id,
      [q.trueFalse.question.id]: q.trueFalse.right.id,
    });
    expect(result).toMatchObject({
      score: 1,
      passed: true,
      grade: "A",
      totalCorrect: 2,
      totalQuestions: 2,
    });
    expect(result?.questionResults).toEqual([
      {
        questionId: q.choice.question.id,
        correct: true,
        selectedOptionId: q.choice.right.id,
        correctOptionId: q.choice.right.id,
      },
      {
        questionId: q.trueFalse.question.id,
        correct: true,
        selectedOptionId: q.trueFalse.right.id,
        correctOptionId: q.trueFalse.right.id,
      },
    ]);

    const answers = s.db.select().from(schema.quizAnswers).all();
    expect(answers).toHaveLength(2);
    expect(answers.every((a) => a.attemptId === result?.attemptId)).toBe(true);
    expect(s.page.getBestAttempt(s.user.id, q.quiz.id)?.id).toBe(
      result?.attemptId
    );
  });

  it("marks a wrong answer and an unanswered question", () => {
    const result = s.page.computeResult(s.user.id, q.quiz.id, {
      [q.trueFalse.question.id]: q.trueFalse.wrong.id,
    });
    expect(result).toMatchObject({
      score: 0,
      passed: false,
      grade: "F",
      totalCorrect: 0,
    });
    expect(result?.questionResults).toEqual([
      {
        questionId: q.choice.question.id,
        correct: false,
        selectedOptionId: null,
        correctOptionId: null,
      },
      {
        questionId: q.trueFalse.question.id,
        correct: false,
        selectedOptionId: q.trueFalse.wrong.id,
        correctOptionId: q.trueFalse.right.id,
      },
    ]);
    // Only the answered question is stored.
    expect(s.db.select().from(schema.quizAnswers).all()).toHaveLength(1);
  });

  it("fails a half-right attempt", () => {
    const result = s.page.computeResult(s.user.id, q.quiz.id, {
      [q.choice.question.id]: q.choice.wrong.id,
      [q.trueFalse.question.id]: q.trueFalse.right.id,
    });
    expect(result).toMatchObject({ score: 0.5, passed: false, grade: "F" });
    expect(result?.questionResults[0].correctOptionId).toBe(q.choice.right.id);
  });

  it("returns null for an unknown quiz and records nothing", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(s.page.computeResult(s.user.id, q.quiz.id + 1, {})).toBeNull();
    expect(logged).toHaveBeenCalledWith("quiz not found");
    expect(s.db.select().from(schema.quizAttempts).all()).toEqual([]);
    logged.mockRestore();
  });

  it("returns null and logs when the attempt cannot be stored", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(s.page.computeResult(9999, q.quiz.id, {})).toBeNull();
    expect(logged).toHaveBeenCalledWith(expect.any(Error));
    logged.mockRestore();
  });

  it("scores a quiz with no questions as zero", () => {
    const empty = s.db
      .insert(schema.quizzes)
      .values({ lessonId: s.lessons[1].id, title: "Empty", passingScore: 0.7 })
      .returning()
      .get();
    expect(s.page.computeResult(s.user.id, empty.id, {})).toMatchObject({
      score: 0,
      passed: false,
      totalQuestions: 0,
    });
  });

  it("needs more than 70% to pass", () => {
    const quiz = s.db
      .insert(schema.quizzes)
      .values({ lessonId: s.lessons[2].id, title: "Ten", passingScore: 0.7 })
      .returning()
      .get();
    const answers: Record<number, number> = {};
    for (let i = 0; i < 10; i++) {
      const question = s.db
        .insert(schema.quizQuestions)
        .values({
          quizId: quiz.id,
          questionText: `Q${i}`,
          questionType: schema.QuestionType.TrueFalse,
          position: i,
        })
        .returning()
        .get();
      const right = s.db
        .insert(schema.quizOptions)
        .values({ questionId: question.id, optionText: "T", isCorrect: true })
        .returning()
        .get();
      if (i < 7) answers[question.id] = right.id;
    }
    expect(s.page.computeResult(s.user.id, quiz.id, answers)).toMatchObject({
      score: 0.7,
      passed: false,
      grade: "C",
    });
  });

  it("keeps the best attempt as the best", () => {
    const good = s.page.computeResult(s.user.id, q.quiz.id, {
      [q.choice.question.id]: q.choice.right.id,
      [q.trueFalse.question.id]: q.trueFalse.right.id,
    });
    s.page.computeResult(s.user.id, q.quiz.id, {});
    expect(s.page.getBestAttempt(s.user.id, q.quiz.id)?.id).toBe(
      good?.attemptId
    );
    expect(s.page.getBestAttempt(s.instructor.id, q.quiz.id)).toBeUndefined();
  });
});
