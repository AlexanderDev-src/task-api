import { ValidationError } from "./errors.ts";

export const TASK_STATUSES = ["todo", "in_progress", "done"] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export function isTaskStatus(value: string): value is TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(value);
}

/** A UUID in lowercase hyphenated form. Only `parseTaskId` and `newTask`
    produce one, so a raw string can never reach the database as an id. */
export type TaskId = string & { readonly __brand: "TaskId" };

export type Task = {
  id: TaskId;
  title: string;
  description: string | null;
  status: TaskStatus;
  createdAt: Date;
  dueAt: Date | null;
};

const HYPHENATED_UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const SIMPLE_UUID = /^[0-9a-f]{32}$/i;
const URN_PREFIX = "urn:uuid:";

function stripWrapper(raw: string): string {
  if (raw.startsWith(URN_PREFIX)) return raw.slice(URN_PREFIX.length);
  if (raw.startsWith("{") && raw.endsWith("}")) return raw.slice(1, -1);
  return raw;
}

/** Accepts the four spellings the Rust `uuid` crate accepted: hyphenated,
    32 hex digits, `{hyphenated}` and `urn:uuid:hyphenated`, in any case.
    Returns null for anything else. */
export function parseTaskId(raw: string): TaskId | null {
  if (SIMPLE_UUID.test(raw)) {
    const hex = raw.toLowerCase();
    const groups = [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20),
    ];
    return groups.join("-") as TaskId;
  }
  const hyphenated = stripWrapper(raw);
  if (!HYPHENATED_UUID.test(hyphenated)) return null;
  return hyphenated.toLowerCase() as TaskId;
}

const TITLE_MAX_LENGTH = 200;

/** Throws ValidationError unless the title is 1-200 characters. */
export function assertValidTitle(title: string): void {
  // Spread counts code points, like Rust's `chars().count()`. `title.length`
  // counts UTF-16 units and would see one emoji as two characters.
  const length = [...title].length;
  if (length < 1 || length > TITLE_MAX_LENGTH) {
    throw new ValidationError([
      { field: "title", message: "title must be 1-200 chars" },
    ]);
  }
}

/** A new task always starts as `todo`, with a fresh id and the current time. */
export function newTask(
  title: string,
  description: string | null,
  dueAt: Date | null,
): Task {
  assertValidTitle(title);
  return {
    id: crypto.randomUUID() as TaskId,
    title,
    description,
    status: "todo",
    createdAt: new Date(),
    dueAt,
  };
}
