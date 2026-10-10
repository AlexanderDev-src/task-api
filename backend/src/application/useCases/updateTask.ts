import { TaskNotFoundError } from "../../domain/errors.ts";
import { assertValidTitle } from "../../domain/task.ts";
import type { Task, TaskId, TaskStatus } from "../../domain/task.ts";
import type { TaskRepository } from "../ports/taskRepository.ts";

/** A missing key means "leave this field alone". Only `description` can also
    be null, and null means "clear it". */
export type UpdateTaskInput = {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
};

export class UpdateTask {
  private readonly tasks: TaskRepository;

  constructor(tasks: TaskRepository) {
    this.tasks = tasks;
  }

  async execute(id: TaskId, changes: UpdateTaskInput): Promise<Task> {
    // Checked before the lookup, so a bad title is a validation error even
    // when the id does not exist.
    if (changes.title !== undefined) assertValidTitle(changes.title);

    const current = await this.tasks.findById(id);
    if (current === null) throw new TaskNotFoundError();

    const updated: Task = {
      ...current,
      title: changes.title ?? current.title,
      // Not `??`: null is a real value here and must overwrite the old text.
      description:
        changes.description === undefined
          ? current.description
          : changes.description,
      status: changes.status ?? current.status,
    };
    await this.tasks.update(updated);
    return updated;
  }
}
