import { db } from "~/db";
import type { Db } from "./lib/db";
import {
  getCommentById,
  getCourseForLesson,
  getCourseWithDetails,
  getLessonById,
  getModuleById,
  getUserById,
} from "./lib/course";
import {
  calculateWatchProgress,
  getLastWatchPosition,
  getLessonProgress,
  getLessonProgressForCourse,
  markLessonComplete,
  markLessonInProgress,
} from "./lib/progress";
import {
  computeResult,
  getBestAttempt,
  getQuizById,
  getQuizByLessonId,
  getQuizWithQuestions,
} from "./lib/quiz";
import { getLessonThread } from "./lib/thread";

export type { Db } from "./lib/db";
export type { FlatLesson } from "./lib/course";
export type { CommentAuthor, ThreadComment } from "./lib/thread";
export type { QuestionResult } from "./lib/quiz";
export { flattenCourseLessons } from "./lib/course";
export { calculateGrade } from "./lib/quiz";
export { renderThread } from "./lib/thread";

type DropDb<F> = F extends (db: Db, ...args: infer A) => infer R
  ? (...args: A) => R
  : never;

function bind<F extends (db: Db, ...args: never[]) => unknown>(
  database: Db,
  fn: F
): DropDb<F> {
  return ((...args: never[]) => fn(database, ...args)) as DropDb<F>;
}

/**
 * The reads and writes behind the Lesson page, bound to a database. The app
 * uses `lessonPage`, which reads the app database; tests build their own
 * against a test database.
 */
export function createLessonPage(database: Db) {
  return {
    getCourseWithDetails: bind(database, getCourseWithDetails),
    getLessonById: bind(database, getLessonById),
    getModuleById: bind(database, getModuleById),
    getUserById: bind(database, getUserById),
    getCourseForLesson: bind(database, getCourseForLesson),
    getCommentById: bind(database, getCommentById),
    getLessonProgress: bind(database, getLessonProgress),
    getLessonProgressForCourse: bind(database, getLessonProgressForCourse),
    markLessonComplete: bind(database, markLessonComplete),
    markLessonInProgress: bind(database, markLessonInProgress),
    getLastWatchPosition: bind(database, getLastWatchPosition),
    calculateWatchProgress: bind(database, calculateWatchProgress),
    getLessonThread: bind(database, getLessonThread),
    getQuizById: bind(database, getQuizById),
    getQuizByLessonId: bind(database, getQuizByLessonId),
    getQuizWithQuestions: bind(database, getQuizWithQuestions),
    getBestAttempt: bind(database, getBestAttempt),
    computeResult: bind(database, computeResult),
  };
}

// Pure so a route importing this only for its loader doesn't pull the
// database into the client bundle (see `~/db`).
export const lessonPage = /* @__PURE__ */ createLessonPage(db);
