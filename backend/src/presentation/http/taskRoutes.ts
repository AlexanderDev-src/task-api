import { Elysia } from "elysia";

import type { CreateTask } from "../../application/useCases/createTask.ts";
import type { DeleteTask } from "../../application/useCases/deleteTask.ts";
import type { GetTask } from "../../application/useCases/getTask.ts";
import type { ListTasks } from "../../application/useCases/listTasks.ts";
import type { UpdateTask } from "../../application/useCases/updateTask.ts";
import { TaskNotFoundError } from "../../domain/errors.ts";
import {
  parseCreateTaskBody,
  parseListQuery,
  parseTaskIdParam,
  parseUpdateTaskBody,
} from "./requestParsing.ts";
import { jsonResponse, toErrorResponse, toTaskBody } from "./responses.ts";

export type TaskUseCases = {
  createTask: CreateTask;
  getTask: GetTask;
  listTasks: ListTasks;
  updateTask: UpdateTask;
  deleteTask: DeleteTask;
};

// Elysia must not read the body itself: requestParsing.ts does, so that a body
// that will not parse gets this API's own 400 and not the framework's.
const rawBody = { parse: "none" } as const;

/** HTTP only: request in, use case call, response out. */
export function createApp(useCases: TaskUseCases) {
  // strictPath: "/tasks/" is not "/tasks". It is an unknown route.
  return new Elysia({ strictPath: true })
    .onError(({ code, error }) =>
      // An unknown route answers exactly like an unknown task.
      toErrorResponse(code === "NOT_FOUND" ? new TaskNotFoundError() : error),
    )
    .get("/health", () => "OK")
    .post(
      "/tasks",
      async ({ request }) => {
        const input = await parseCreateTaskBody(request);
        const task = await useCases.createTask.execute(input);
        return jsonResponse(201, toTaskBody(task));
      },
      rawBody,
    )
    .get("/tasks", async ({ request }) => {
      const tasks = await useCases.listTasks.execute(parseListQuery(request.url));
      return jsonResponse(200, tasks.map(toTaskBody));
    })
    .get("/tasks/:id", async ({ params }) => {
      const task = await useCases.getTask.execute(parseTaskIdParam(params.id));
      return jsonResponse(200, toTaskBody(task));
    })
    .patch(
      "/tasks/:id",
      async ({ params, request }) => {
        // The id is read first: a bad id wins over a bad body.
        const id = parseTaskIdParam(params.id);
        const changes = await parseUpdateTaskBody(request);
        const task = await useCases.updateTask.execute(id, changes);
        return jsonResponse(200, toTaskBody(task));
      },
      rawBody,
    )
    .delete(
      "/tasks/:id",
      async ({ params }) => {
        await useCases.deleteTask.execute(parseTaskIdParam(params.id));
        return new Response(null, { status: 204 });
      },
      rawBody,
    );
}
