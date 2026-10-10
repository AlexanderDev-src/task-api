import { SQL } from "bun";
import { join } from "node:path";

import { CreateTask } from "./application/useCases/createTask.ts";
import { DeleteTask } from "./application/useCases/deleteTask.ts";
import { GetTask } from "./application/useCases/getTask.ts";
import { ListTasks } from "./application/useCases/listTasks.ts";
import { UpdateTask } from "./application/useCases/updateTask.ts";
import { loadConfig } from "./infrastructure/config.ts";
import { runMigrations } from "./infrastructure/postgres/migrations.ts";
import { PostgresTaskRepository } from "./infrastructure/postgres/taskRepository.ts";
import { createApp } from "./presentation/http/taskRoutes.ts";

/* -------------------------------------------------------------------------
   Composition root. The only file that knows every layer: it reads the
   config, builds the Postgres repository, hands it to the use cases, and
   hands those to the HTTP routes.
   ------------------------------------------------------------------------- */

// The SQL files stay at the repo root, where the Rust version kept them.
const MIGRATIONS_DIRECTORY = join(import.meta.dir, "../../migrations");
const MAX_CONNECTIONS = 5;
const SHUTDOWN_TIMEOUT_MS = 5_000;

async function run(): Promise<void> {
  const config = loadConfig(process.env);
  const sql = new SQL({ url: config.databaseUrl, max: MAX_CONNECTIONS });
  await runMigrations(sql, MIGRATIONS_DIRECTORY);

  const tasks = new PostgresTaskRepository(sql);
  const app = createApp({
    createTask: new CreateTask(tasks),
    getTask: new GetTask(tasks),
    listTasks: new ListTasks(tasks),
    updateTask: new UpdateTask(tasks),
    deleteTask: new DeleteTask(tasks),
  }).listen({ hostname: "127.0.0.1", port: config.port });

  const shutDown = async () => {
    // Requests already running get five seconds to finish. After that the
    // process exits anyway, which cuts them off and drops the connections.
    const cutOff = setTimeout(() => process.exit(0), SHUTDOWN_TIMEOUT_MS);
    await app.stop();
    await sql.close();
    clearTimeout(cutOff);
  };
  process.once("SIGINT", shutDown);
  process.once("SIGTERM", shutDown);
}

try {
  await run();
} catch (error) {
  console.error(`Error: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
