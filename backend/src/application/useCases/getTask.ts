import { TaskNotFoundError } from "../../domain/errors.ts";
import type { Task, TaskId } from "../../domain/task.ts";
import type { TaskRepository } from "../ports/taskRepository.ts";

export class GetTask {
  private readonly tasks: TaskRepository;

  constructor(tasks: TaskRepository) {
    this.tasks = tasks;
  }

  async execute(id: TaskId): Promise<Task> {
    const task = await this.tasks.findById(id);
    if (task === null) throw new TaskNotFoundError();
    return task;
  }
}
