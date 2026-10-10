import { newTask } from "../../domain/task.ts";
import type { Task } from "../../domain/task.ts";
import type { TaskRepository } from "../ports/taskRepository.ts";

export type CreateTaskInput = {
  title: string;
  description: string | null;
};

export class CreateTask {
  private readonly tasks: TaskRepository;

  constructor(tasks: TaskRepository) {
    this.tasks = tasks;
  }

  async execute(input: CreateTaskInput): Promise<Task> {
    const task = newTask(input.title, input.description);
    await this.tasks.insert(task);
    return task;
  }
}
