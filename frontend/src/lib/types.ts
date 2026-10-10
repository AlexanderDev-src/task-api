/* Wire types. These mirror backend/src/presentation/http/responses.ts — fields
   stay snake_case on the wire.

   TODO: re-check this file after the SQLite -> PostgreSQL migration.
   A `due_at` field is expected there; the calendar groups by `created_at`
   until it exists. */

export type TaskStatus = "todo" | "in_progress" | "done";

export type Task = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  /** RFC 3339, e.g. "2026-09-08T09:41:00Z" */
  created_at: string;
};

/** Body of POST /tasks. Backend validates title as 1-200 chars. */
export type CreateTask = {
  title: string;
  description?: string | null;
};

/** Body of PATCH /tasks/{id}. Every field optional. */
export type UpdateTask = {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
};

/** Query of GET /tasks. limit is 1-100 (default 20), offset >= 0. */
export type TaskQuery = {
  status?: TaskStatus;
  limit?: number;
  offset?: number;
};

/** Every non-2xx response body built in backend/src/presentation/http/responses.ts. */
export type ApiErrorBody = {
  error: string;
  message: string;
};

export const STATUS_ORDER: TaskStatus[] = ["todo", "in_progress", "done"];

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "Todo",
  in_progress: "In progress",
  done: "Done",
};
