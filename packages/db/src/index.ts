export { type CreateDbOptions, createDb, type Database, type DbHandle } from "./client.js";
export {
  InvalidConnectionStringError,
  InvalidLockTimeoutError,
  InvalidMigrationsFolderError,
  InvalidVocabularyValueError,
  MigrationError,
  type MigrationStage,
} from "./errors.js";
export {
  MAX_LOCK_TIMEOUT_MS,
  MIGRATION_LOCK_KEY,
  MIGRATION_LOCK_TIMEOUT_MS,
  MIGRATIONS_FOLDER,
  type MigrateOptions,
  migrateDatabase,
} from "./migrate.js";
export * from "./schema.js";
export {
  ATTEMPT_STATUSES,
  type AttemptStatus,
  CHECK_KINDS,
  CHECK_RESULT_STATUSES,
  type CheckResultStatus,
  LESSON_PROGRESS_STATUSES,
  type LessonProgressStatus,
  MENTOR_REVIEW_STATUSES,
  type MentorReviewStatus,
} from "./vocabulary.js";
