import { RepositoryError } from "../../application/ports/taskRepository.ts";
import { TaskNotFoundError, ValidationError } from "../../domain/errors.ts";
import type { Task } from "../../domain/task.ts";
import { BadRequestError, MalformedTaskIdError } from "./requestParsing.ts";

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Wire shape of a task. Field names stay snake_case, as the frontend expects. */
export function toTaskBody(task: Task) {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    created_at: task.createdAt.toISOString(),
    due_at: task.dueAt === null ? null : task.dueAt.toISOString(),
  };
}

function errorBody(status: number, error: string, message: string): Response {
  return jsonResponse(status, { error, message });
}

/** Every error becomes an HTTP response here, and only here.
    400: the request will not parse. 422: it parses but breaks a rule.
    404: no such task or route. 500: the server's own fault. */
export function toErrorResponse(error: unknown): Response {
  if (error instanceof TaskNotFoundError) {
    return errorBody(404, "not_found", error.message);
  }
  if (error instanceof BadRequestError) {
    return errorBody(400, "bad_request", error.message);
  }
  if (error instanceof ValidationError) {
    return errorBody(422, "required", error.message);
  }
  if (error instanceof MalformedTaskIdError) {
    // Plain text, not the JSON shape: the Rust version let ntex answer a bad
    // UUID itself, and this keeps that response as it was.
    return new Response(error.message, {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  if (error instanceof RepositoryError) {
    return errorBody(500, "internal_server_error", error.message);
  }
  return errorBody(500, "server_error", "error occurred. Please try again");
}
