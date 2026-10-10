/* Wire types. These mirror backend/src/presentation/http/responses.ts — fields
   stay snake_case on the wire. */

export type TaskStatus = "todo" | "in_progress" | "done";

export type Task = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  /** RFC 3339, e.g. "2026-09-08T09:41:00Z" */
  created_at: string;
  /** RFC 3339, or null when the task has no due date. */
  due_at: string | null;
};

/** Body of POST /tasks. Backend validates title as 1-200 chars. */
export type CreateTask = {
  title: string;
  description?: string | null;
  due_at?: string | null;
};

/** Body of PATCH /tasks/{id}. Every field optional. For description and
    due_at, null clears the field and a missing key leaves it alone. */
export type UpdateTask = {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  due_at?: string | null;
};

/** Query of GET /tasks. limit is 1-100 (default 20), offset >= 0.
    due_from (inclusive) and due_before (exclusive) are RFC 3339 instants. */
export type TaskQuery = {
  status?: TaskStatus;
  limit?: number;
  offset?: number;
  due_from?: string;
  due_before?: string;
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
