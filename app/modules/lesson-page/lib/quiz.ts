import { and, desc, eq, inArray } from "drizzle-orm";
import {
  quizzes,
  quizQuestions,
  quizOptions,
  quizAttempts,
  quizAnswers,
  QuestionType,
} from "~/db/schema";
import type { Db } from "./db";

export function getQuizById(db: Db, quizId: number) {
  return db.select().from(quizzes).where(eq(quizzes.id, quizId)).get();
}

export function getQuizByLessonId(db: Db, lessonId: number) {
  return db.select().from(quizzes).where(eq(quizzes.lessonId, lessonId)).get();
}

function getQuestions(db: Db, quizId: number) {
  return db
    .select()
    .from(quizQuestions)
    .where(eq(quizQuestions.quizId, quizId))
    .orderBy(quizQuestions.position)
    .all();
}

export function getQuizWithQuestions(db: Db, quizId: number) {
  const quiz = db.select().from(quizzes).where(eq(quizzes.id, quizId)).get();
  if (!quiz) return null;

  const questions = getQuestions(db, quizId);

  const options = getOptionsForQuestions(
    db,
    questions.map((question) => question.id)
  );
  const questionsWithOptions = questions.map((question) => ({
    ...question,
    options: options.filter((option) => option.questionId === question.id),
  }));

  return { ...quiz, questions: questionsWithOptions };
}

function getOptionsForQuestions(db: Db, questionIds: number[]) {
  return db
    .select()
    .from(quizOptions)
    .where(inArray(quizOptions.questionId, questionIds))
    .all();
}

const SCORED_QUESTION_TYPES: ReadonlySet<QuestionType> = new Set([
  QuestionType.MultipleChoice,
  QuestionType.TrueFalse,
]);

export function getBestAttempt(db: Db, userId: number, quizId: number) {
  return db
    .select()
    .from(quizAttempts)
    .where(
      and(eq(quizAttempts.userId, userId), eq(quizAttempts.quizId, quizId))
    )
    .orderBy(desc(quizAttempts.score))
    .limit(1)
    .get();
}

export function calculateGrade(score: number): string {
  if (score >= 0.9) return "A";
  if (score >= 0.8) return "B";
  if (score >= 0.7) return "C";
  if (score >= 0.6) return "D";
  return "F";
}

export type QuestionResult = {
  questionId: number;
  correct: boolean;
  selectedOptionId: number | null;
  correctOptionId: number | null;
};

function getCorrectOptionByQuestion(db: Db, questionIds: number[]) {
  const correctOptions = db
    .select({ id: quizOptions.id, questionId: quizOptions.questionId })
    .from(quizOptions)
    .where(
      and(
        inArray(quizOptions.questionId, questionIds),
        eq(quizOptions.isCorrect, true)
      )
    )
    .all();
  return new Map(correctOptions.map((o) => [o.questionId, o.id]));
}

function scoreQuestion(
  question: { id: number; questionType: QuestionType },
  selected: number | undefined,
  correctOptionByQuestion: Map<number, number>
): QuestionResult {
  if (!selected) {
    return {
      questionId: question.id,
      correct: false,
      selectedOptionId: null,
      correctOptionId: null,
    };
  }
  const correctOptionId = SCORED_QUESTION_TYPES.has(question.questionType)
    ? (correctOptionByQuestion.get(question.id) ?? null)
    : null;
  return {
    questionId: question.id,
    correct: selected === correctOptionId,
    selectedOptionId: selected,
    correctOptionId,
  };
}

function recordAttempt(
  db: Db,
  attempt: { userId: number; quizId: number; score: number; passed: boolean },
  questionResults: QuestionResult[]
) {
  return db.transaction((tx) => {
    const inserted = tx.insert(quizAttempts).values(attempt).returning().get();
    const answers = questionResults.flatMap((result) =>
      result.selectedOptionId === null
        ? []
        : [
            {
              attemptId: inserted.id,
              questionId: result.questionId,
              selectedOptionId: result.selectedOptionId,
            },
          ]
    );
    if (answers.length > 0) tx.insert(quizAnswers).values(answers).run();
    return inserted;
  });
}

export function computeResult(
  db: Db,
  userId: number,
  quizId: number,
  selectedAnswers: Record<number, number>
) {
  try {
    const quiz = db.select().from(quizzes).where(eq(quizzes.id, quizId)).get();
    if (!quiz) {
      console.error("quiz not found");
      return null;
    }

    const questions = getQuestions(db, quizId);

    const correctOptionByQuestion = getCorrectOptionByQuestion(
      db,
      questions.map((question) => question.id)
    );
    const questionResults = questions.map((question) =>
      scoreQuestion(
        question,
        selectedAnswers[question.id],
        correctOptionByQuestion
      )
    );

    const correct = questionResults.filter((result) => result.correct).length;
    const total = questions.length;
    const scoreValue = total > 0 ? correct / total : 0;
    const passed = scoreValue > 0.7;

    const attempt = recordAttempt(
      db,
      { userId, quizId, score: scoreValue, passed },
      questionResults
    );

    return {
      attemptId: attempt.id,
      score: scoreValue,
      passed,
      grade: calculateGrade(scoreValue),
      totalCorrect: correct,
      totalQuestions: total,
      questionResults,
    };
  } catch (error) {
    console.error(error);
    return null;
  }
}
