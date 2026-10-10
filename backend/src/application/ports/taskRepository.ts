import type { Task, TaskId, TaskStatus } from "../../domain/task.ts";

export type TaskPage = {
  status: TaskStatus | null;
  /** Tasks due at or after this instant. */
  dueFrom: Date | null;
  /** Tasks due before this instant. */
  dueBefore: Date | null;
  // bigint because the Rust version used i64 here: `?offset=9223372036854775807`
  // is a valid request, and a JS number cannot hold it exactly.
  limit: bigint;
  offset: bigint;
};

/** What the use cases need from storage. The Postgres implementation lives in
    infrastructure; nothing in this layer knows about SQL. */
export type TaskRepository = {
  insert(task: Task): Promise<void>;
  findById(id: TaskId): Promise<Task | null>;
  /** Newest first. */
  list(page: TaskPage): Promise<Task[]>;
  update(task: Task): Promise<void>;
  /** Resolves to false when there was no such task. */
  remove(id: TaskId): Promise<boolean>;
};

/** Storage failed. The real reason stays in `cause` and is not sent to clients. */
export class RepositoryError extends Error {
  constructor(cause: unknown) {
    super("database error", { cause });
    this.name = "RepositoryError";
  }
}
