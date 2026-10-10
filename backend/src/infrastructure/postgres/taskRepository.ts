import type { SQL } from "bun";

import { RepositoryError } from "../../application/ports/taskRepository.ts";
import type {
  TaskPage,
  TaskRepository,
} from "../../application/ports/taskRepository.ts";
import { isTaskStatus } from "../../domain/task.ts";
import type { Task, TaskId } from "../../domain/task.ts";

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  created_at: Date;
  due_at: Date | null;
};

function toTask(row: TaskRow): Task {
  // `status` is plain TEXT with no CHECK constraint, so the database can hold
  // a value the domain does not know.
  if (!isTaskStatus(row.status)) {
    throw new Error(`task ${row.id} has unknown status "${row.status}"`);
  }
  return {
    id: row.id as TaskId,
    title: row.title,
    description: row.description,
    status: row.status,
    createdAt: row.created_at,
    dueAt: row.due_at,
  };
}

/** Runs one storage operation and turns any failure into RepositoryError, so
    the layers above never see a driver error. */
async function inStorage<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (cause) {
    throw new RepositoryError(cause);
  }
}

/** All SQL lives here. */
export class PostgresTaskRepository implements TaskRepository {
  private readonly sql: SQL;

  constructor(sql: SQL) {
    this.sql = sql;
  }

  insert(task: Task): Promise<void> {
    return inStorage(async () => {
      await this.sql`
        INSERT INTO tasks (id, title, description, status, created_at, due_at)
        VALUES (
          ${task.id}, ${task.title}, ${task.description},
          ${task.status}, ${task.createdAt}, ${task.dueAt}
        )`;
    });
  }

  findById(id: TaskId): Promise<Task | null> {
    return inStorage(async () => {
      const rows: TaskRow[] =
        await this.sql`SELECT * FROM tasks WHERE id = ${id}`;
      const row = rows[0];
      return row === undefined ? null : toTask(row);
    });
  }

  list(page: TaskPage): Promise<Task[]> {
    return inStorage(async () => {
      const status =
        page.status === null
          ? this.sql`TRUE`
          : this.sql`status = ${page.status}`;
      // A task with no due date matches neither bound.
      const dueFrom =
        page.dueFrom === null
          ? this.sql`TRUE`
          : this.sql`due_at >= ${page.dueFrom}`;
      const dueBefore =
        page.dueBefore === null
          ? this.sql`TRUE`
          : this.sql`due_at < ${page.dueBefore}`;
      const rows: TaskRow[] = await this.sql`
        SELECT * FROM tasks
        WHERE ${status} AND ${dueFrom} AND ${dueBefore}
        ORDER BY created_at DESC
        LIMIT ${page.limit} OFFSET ${page.offset}`;
      return rows.map(toTask);
    });
  }

  update(task: Task): Promise<void> {
    return inStorage(async () => {
      await this.sql`
        UPDATE tasks
        SET title = ${task.title},
            description = ${task.description},
            status = ${task.status},
            due_at = ${task.dueAt}
        WHERE id = ${task.id}`;
    });
  }

  remove(id: TaskId): Promise<boolean> {
    return inStorage(async () => {
      const result = await this.sql`DELETE FROM tasks WHERE id = ${id}`;
      return result.count > 0;
    });
  }
}
