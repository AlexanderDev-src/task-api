import { ValidationError } from "../../domain/errors.ts";
import type { Violation } from "../../domain/errors.ts";
import type { Task, TaskStatus } from "../../domain/task.ts";
import type { TaskRepository } from "../ports/taskRepository.ts";

export type ListTasksInput = {
  status?: TaskStatus;
  limit?: bigint;
  offset?: bigint;
};

const DEFAULT_LIMIT = 20n;
const MAX_LIMIT = 100n;

export class ListTasks {
  private readonly tasks: TaskRepository;

  constructor(tasks: TaskRepository) {
    this.tasks = tasks;
  }

  async execute(input: ListTasksInput): Promise<Task[]> {
    const limit = input.limit ?? DEFAULT_LIMIT;
    const offset = input.offset ?? 0n;

    const violations: Violation[] = [];
    if (limit < 1n || limit > MAX_LIMIT) {
      violations.push({ field: "limit", message: "limit must be 1-100" });
    }
    if (offset < 0n) {
      violations.push({ field: "offset", message: "offset must not be negative" });
    }
    if (violations.length > 0) throw new ValidationError(violations);

    return this.tasks.list({ status: input.status ?? null, limit, offset });
  }
}
