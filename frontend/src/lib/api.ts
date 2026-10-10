import type {
  ApiErrorBody,
  CreateTask,
  Task,
  TaskQuery,
  UpdateTask,
} from "./types.ts";

/* -------------------------------------------------------------------------
   THE ONLY FILE THAT SHOULD TALK TO THE BACKEND.

   Requests go to BASE_URL, which defaults to "/api". In dev that path is
   proxied to the backend by the `server.proxy` block in vite.config.ts,
   which strips the "/api" prefix. Set VITE_API_URL in frontend/.env.local to
   point at a different origin (the backend has no CORS layer, so a
   cross-origin URL needs one added first).

   AI Write it - Alexander Sanford
   ------------------------------------------------------------------------- */

export const BASE_URL = import.meta.env.VITE_API_URL ?? "/api";

/** Thrown on any non-2xx. `code` is the `error` field of the error body. */
export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/** GET /tasks?status=&limit=&offset=&due_from=&due_before= — serialises TaskQuery. */
export function taskQueryString(query: TaskQuery): string {
  const params = new URLSearchParams();
  if (query.status) params.set("status", query.status);
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  if (query.offset !== undefined) params.set("offset", String(query.offset));
  if (query.due_from) params.set("due_from", query.due_from);
  if (query.due_before) params.set("due_before", query.due_before);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      headers: { "content-type": "application/json" },
      ...init,
    });
  } catch (cause) {
    throw new ApiError(0, "network_error", "could not reach the server");
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(
      res.status,
      body?.error ?? "server_error",
      body?.message ?? res.statusText,
    );
  }

  // 204 (DELETE) and any other empty body must not hit res.json().
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return undefined as T;
  }
  return (await res.json()) as T;
}

/** GET /tasks — 200 with Task[]. */
export async function listTasks(query: TaskQuery = {}): Promise<Task[]> {
  return request<Task[]>(`/tasks${taskQueryString(query)}`);
}

/** GET /tasks/{id} — 200 with Task, or 404 not_found. */
export async function getTask(id: string): Promise<Task> {
  return request<Task>(`/tasks/${id}`);
}

/** POST /tasks — 201 with the created Task, or 422 required on a bad title. */
export async function createTask(input: CreateTask): Promise<Task> {
  return request<Task>("/tasks", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** PATCH /tasks/{id} — 200 with the updated Task, or 404 not_found. */
export async function updateTask(id: string, input: UpdateTask): Promise<Task> {
  return request<Task>(`/tasks/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

/** DELETE /tasks/{id} — 404 not_found if it is already gone. */
export async function deleteTask(id: string): Promise<void> {
  await request<void>(`/tasks/${id}`, { method: "DELETE" });
}

/** GET /health — plain text "OK". Handy as a connection check on boot. */
export async function health(): Promise<string> {
  const res = await fetch(`${BASE_URL}/health`);
  if (!res.ok) throw new ApiError(res.status, "server_error", res.statusText);
  return res.text();
}
