import type { CreateTaskInput } from "../../application/useCases/createTask.ts";
import type { ListTasksInput } from "../../application/useCases/listTasks.ts";
import type { UpdateTaskInput } from "../../application/useCases/updateTask.ts";
import { TASK_STATUSES, isTaskStatus, parseTaskId } from "../../domain/task.ts";
import type { TaskId, TaskStatus } from "../../domain/task.ts";

/* -------------------------------------------------------------------------
   Turns raw HTTP input into typed use-case input. Everything thrown here is
   a 400 (or the 404 for a bad id): the request could not be read.

   Rules such as "title is 1-200 chars" are NOT checked here. They belong to
   the use cases and come back as 422. Elysia's own schema validation is not
   used because it cannot keep those two cases apart the way the Rust version
   did with serde (400) and validator (422).
   ------------------------------------------------------------------------- */

/** The request could not be read at all: wrong content type, broken JSON, a
    field of the wrong type, a query value that is not a number. */
export class BadRequestError extends Error {
  constructor(reason: string) {
    super(`bad request : ${reason}`);
    this.name = "BadRequestError";
  }
}

/** The `{id}` path segment is not a UUID. */
export class MalformedTaskIdError extends Error {
  constructor() {
    super("Path deserialize error: UUID parsing failed");
    this.name = "MalformedTaskIdError";
  }
}

const MAX_JSON_BYTES = 32_768;
const I64_MIN = -(2n ** 63n);
const I64_MAX = 2n ** 63n - 1n;

type JsonObject = Record<string, unknown>;

/** A missing key and an explicit null both mean "no value" for most fields,
    as they did for a serde `Option<T>`. */
function isAbsent(value: unknown): value is null | undefined {
  return value === undefined || value === null;
}

function jsonError(reason: string): BadRequestError {
  return new BadRequestError(`Json deserialize error: ${reason}`);
}

function queryError(reason: string): BadRequestError {
  return new BadRequestError(`Query deserialize error: ${reason}`);
}

function unknownStatus(raw: string): string {
  const expected = TASK_STATUSES.map((status) => `\`${status}\``).join(", ");
  return `unknown variant \`${raw}\`, expected one of ${expected}`;
}

/** Names a JSON value the way serde did, for "invalid type" messages. */
function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "sequence";
  switch (typeof value) {
    case "boolean":
      return `boolean \`${value}\``;
    case "number":
      return Number.isInteger(value)
        ? `integer \`${value}\``
        : `floating point \`${value}\``;
    case "string":
      return `string ${JSON.stringify(value)}`;
    default:
      return "map";
  }
}

/** True for `application/json`, `text/json` and any `+json` suffix. */
function isJsonContentType(header: string | null): boolean {
  if (header === null) return false;
  const [mediaType = ""] = header.split(";");
  const [, subtype = ""] = mediaType.trim().toLowerCase().split("/");
  return subtype === "json" || subtype.endsWith("+json");
}

async function readJsonObject(request: Request): Promise<JsonObject> {
  if (!isJsonContentType(request.headers.get("content-type"))) {
    throw new BadRequestError("Content type error");
  }
  const bytes = await request.bytes();
  if (bytes.byteLength > MAX_JSON_BYTES) {
    throw new BadRequestError("Json payload size is bigger than allowed");
  }

  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (cause) {
    throw jsonError(cause instanceof Error ? cause.message : String(cause));
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw jsonError(`invalid type: ${describe(value)}, expected a JSON object`);
  }
  return value as JsonObject;
}

function requireString(value: unknown): string {
  if (typeof value !== "string") {
    throw jsonError(`invalid type: ${describe(value)}, expected a string`);
  }
  return value;
}

/** Body of POST /tasks. */
export async function parseCreateTaskBody(
  request: Request,
): Promise<CreateTaskInput> {
  const body = await readJsonObject(request);
  if (body.title === undefined) throw jsonError("missing field `title`");
  return {
    title: requireString(body.title),
    description: isAbsent(body.description)
      ? null
      : requireString(body.description),
  };
}

/** Body of PATCH /tasks/{id}. */
export async function parseUpdateTaskBody(
  request: Request,
): Promise<UpdateTaskInput> {
  const body = await readJsonObject(request);
  const changes: UpdateTaskInput = {};

  if (!isAbsent(body.title)) changes.title = requireString(body.title);

  // description is the exception: null is kept, because it means "clear it".
  if (body.description !== undefined) {
    changes.description =
      body.description === null ? null : requireString(body.description);
  }

  if (!isAbsent(body.status)) {
    const status = requireString(body.status);
    if (!isTaskStatus(status)) throw jsonError(unknownStatus(status));
    changes.status = status;
  }
  return changes;
}

function parseQueryStatus(raw: string): TaskStatus {
  if (!isTaskStatus(raw)) throw queryError(unknownStatus(raw));
  return raw;
}

/** Same accepted inputs and same messages as Rust's `i64::from_str`. */
function parseQueryInteger(raw: string): bigint {
  if (raw === "") throw queryError("cannot parse integer from empty string");
  if (!/^[+-]?\d+$/.test(raw)) {
    throw queryError("invalid digit found in string");
  }
  const value = BigInt(raw);
  if (value > I64_MAX) {
    throw queryError("number too large to fit in target type");
  }
  if (value < I64_MIN) {
    throw queryError("number too small to fit in target type");
  }
  return value;
}

/** Query of GET /tasks. Unknown keys are ignored; a repeated known key is an
    error. */
export function parseListQuery(url: string): ListTasksInput {
  const query: ListTasksInput = {};
  for (const [key, value] of new URL(url).searchParams) {
    if (key !== "status" && key !== "limit" && key !== "offset") continue;
    if (query[key] !== undefined) throw queryError(`duplicate field \`${key}\``);

    if (key === "status") query.status = parseQueryStatus(value);
    else query[key] = parseQueryInteger(value);
  }
  return query;
}

/** The `{id}` segment of /tasks/{id}. */
export function parseTaskIdParam(raw: string): TaskId {
  const id = parseTaskId(raw);
  if (id === null) throw new MalformedTaskIdError();
  return id;
}
