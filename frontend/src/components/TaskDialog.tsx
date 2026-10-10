import { useState } from "react";
import type { CreateTask, Task, TaskStatus, UpdateTask } from "../lib/types.ts";
import { STATUS_LABEL, STATUS_ORDER } from "../lib/types.ts";
import { dayKey, dayKeyToDueAt } from "../lib/date.ts";
import { Icon } from "./Icon.tsx";

type TaskDialogProps = {
  open: boolean;
  /** null = create, a task = edit. */
  task: Task | null;
  submitting: boolean;
  /** Message from a 422, shown under the title field. */
  error: string | null;
  onClose: () => void;
  onCreate: (input: CreateTask) => void;
  onUpdate: (id: string, input: UpdateTask) => void;
};

export function TaskDialog({
  open,
  task,
  submitting,
  error,
  onClose,
  onCreate,
  onUpdate,
}: TaskDialogProps) {
  /* App remounts this dialog on every open (see the `key` prop there), so the
     fields initialise straight from the task instead of syncing in an effect. */
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? "todo");
  const savedDueDay = task?.due_at ? dayKey(new Date(task.due_at)) : "";
  const [dueDay, setDueDay] = useState(savedDueDay);

  if (!open) return null;

  const submit = () => {
    const dueAt = dueDay === "" ? null : dayKeyToDueAt(dueDay);
    if (task) {
      onUpdate(task.id, {
        title,
        description: description.trim() === "" ? null : description,
        status,
        // Sent only when the day changed, so saving another field does not
        // reset the time of day the task already had.
        ...(dueDay === savedDueDay ? {} : { due_at: dueAt }),
      });
    } else {
      onCreate({
        title,
        description: description.trim() === "" ? null : description,
        due_at: dueAt,
      });
    }
  };

  const field =
    "h-9.5 rounded-lg border border-border bg-bg px-3 text-sm text-head outline-none placeholder:text-muted focus:border-accent-border";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={task ? "Edit task" : "New task"}
        className="flex w-full max-w-md flex-col gap-4 rounded-xl border border-border bg-panel p-5"
      >
        <div className="flex items-center gap-3">
          <span className="text-[15px] font-semibold text-head">
            {task ? "Edit task" : "New task"}
          </span>
          <div className="grow" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-subtle"
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-text">Title</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={200}
              placeholder="Migrate SQLite to PostgreSQL"
              className={`${field} ${error ? "border-accent" : ""}`}
            />
            {error ? <span className="text-[11px] text-accent">{error}</span> : null}
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-text">Description</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              placeholder="Optional"
              className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-head outline-none placeholder:text-muted focus:border-accent-border"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-text">Due</span>
            <input
              type="date"
              value={dueDay}
              onChange={(event) => setDueDay(event.target.value)}
              className={field}
            />
          </label>

          {task ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-text">Status</span>
              <div className="flex flex-wrap gap-2">
                {STATUS_ORDER.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setStatus(value)}
                    className={`inline-flex h-9 items-center rounded-lg border px-3 text-sm ${
                      status === value
                        ? "border-accent-border bg-accent-bg text-accent"
                        : "border-border text-text hover:bg-subtle"
                    }`}
                  >
                    {STATUS_LABEL[value]}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-muted">
              {task ? `PATCH /tasks/${task.id.slice(0, 8)}…` : "POST /tasks"}
            </span>
            <div className="grow" />
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 items-center rounded-lg border border-border px-3.5 text-sm text-text hover:bg-subtle"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-9 items-center rounded-lg bg-accent px-3.5 text-sm font-medium text-on-accent disabled:opacity-60"
            >
              {submitting ? "Saving…" : task ? "Save" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
