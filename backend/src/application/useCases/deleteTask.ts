import { TaskNotFoundError } from "../../domain/errors.ts";
import type { TaskId } from "../../domain/task.ts";
import type { TaskRepository } from "../ports/taskRepository.ts";

export class DeleteTask {
  private readonly tasks: TaskRepository;

  constructor(tasks: TaskRepository) {
    this.tasks = tasks;
  }

  async execute(id: TaskId): Promise<void> {
    const removed = await this.tasks.remove(id);
    if (!removed) throw new TaskNotFoundError();
  }
}
