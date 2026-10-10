import { useCallback, useEffect, useState } from "react";
import { Calendar } from "./components/Calendar.tsx";
import { ConfirmDialog } from "./components/ConfirmDialog.tsx";
import { FilterBar } from "./components/FilterBar.tsx";
import { Header } from "./components/Header.tsx";
import { TaskDialog } from "./components/TaskDialog.tsx";
import { TaskList } from "./components/TaskList.tsx";
import { Toast } from "./components/Toast.tsx";
import { useTheme } from "./hooks/useTheme.ts";
import {
  ApiError,
  createTask,
  deleteTask,
  listTasks,
  taskQueryString,
  updateTask,
} from "./lib/api.ts";
import { dayDueRange, monthDueRange, startOfMonth } from "./lib/date.ts";
import type {
  CreateTask,
  Task,
  TaskQuery,
  TaskStatus,
  UpdateTask,
} from "./lib/types.ts";

const PAGE_SIZE = 20;
/** The most GET /tasks hands back in one request. */
const CALENDAR_LIMIT = 100;

/** Clicking the status mark walks todo -> in progress -> done -> todo. */
const NEXT_STATUS: Record<TaskStatus, TaskStatus> = {
  todo: "in_progress",
  in_progress: "done",
  done: "todo",
};

function App() {
  const { theme, toggle } = useTheme();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [calendarTasks, setCalendarTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] = useState<TaskStatus | null>(null);
  const [offset, setOffset] = useState(0);

  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [pendingDelete, setPendingDelete] = useState<Task | null>(null);
  const [toast, setToast] = useState<{
    code: string | null;
    message: string;
  } | null>(null);

  /* The selected day goes to the backend as due_from / due_before, so the
     list and its paging only ever see that day's tasks. */
  const query: TaskQuery = {
    status: status ?? undefined,
    limit: PAGE_SIZE,
    offset,
    ...(selectedDay ? dayDueRange(selectedDay) : {}),
  };

  const report = useCallback((cause: unknown) => {
    if (cause instanceof ApiError) {
      setToast({ code: String(cause.status), message: cause.message });
    } else {
      setToast({ code: null, message: "request failed" });
    }
  }, []);

  /* The read path of the list. */
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listTasks({
        status: status ?? undefined,
        limit: PAGE_SIZE,
        offset,
        ...(selectedDay ? dayDueRange(selectedDay) : {}),
      });
      setTasks(rows);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "request failed");
    } finally {
      setLoading(false);
    }
  }, [status, offset, selectedDay]);

  /* The read path of the calendar: every task due in the visible month, not
     just the page in the list. A month with more than CALENDAR_LIMIT due
     tasks shows only the newest ones. */
  const loadCalendar = useCallback(async () => {
    try {
      const rows = await listTasks({
        status: status ?? undefined,
        limit: CALENDAR_LIMIT,
        ...monthDueRange(month),
      });
      setCalendarTasks(rows);
    } catch (cause) {
      report(cause);
    }
  }, [status, month, report]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadCalendar();
  }, [loadCalendar]);

  /* An edit can move a task to another day, page or status, so nothing is
     patched in place: both reads run again. */
  const reload = () => {
    void load();
    void loadCalendar();
  };

  const handleCreate = async (input: CreateTask) => {
    setSubmitting(true);
    setFormError(null);
    try {
      await createTask(input);
      setDialogOpen(false);
      reload();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 422) {
        setFormError(cause.message);
      } else {
        report(cause);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (id: string, input: UpdateTask) => {
    setSubmitting(true);
    setFormError(null);
    try {
      await updateTask(id, input);
      setDialogOpen(false);
      reload();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 422) {
        setFormError(cause.message);
      } else {
        report(cause);
      }
    } finally {
      setSubmitting(false);
    }
  };

  /* Optimistic: paint the new status, roll back if the PATCH fails. */
  const handleCycleStatus = async (task: Task) => {
    const next = NEXT_STATUS[task.status];
    const previous = tasks;
    setTasks((current) =>
      current.map((row) =>
        row.id === task.id ? { ...row, status: next } : row,
      ),
    );
    try {
      await updateTask(task.id, { status: next });
      void loadCalendar();
    } catch (cause) {
      setTasks(previous);
      report(cause);
    }
  };

  const handleDelete = async () => {
    const target = pendingDelete;
    if (!target) return;
    setPendingDelete(null);
    try {
      await deleteTask(target.id);
      setTasks((current) => current.filter((task) => task.id !== target.id));
      void loadCalendar();
    } catch (cause) {
      report(cause);
      // A 404 means someone else removed it — reload rather than guess.
      reload();
    }
  };

  const requestLine = `GET /tasks${taskQueryString(query)}`;

  return (
    <div className="flex h-full flex-col bg-bg text-text">
      <Header
        theme={theme}
        onToggleTheme={toggle}
        onNewTask={() => {
          setEditing(null);
          setFormError(null);
          setDialogOpen(true);
        }}
      />

      <div className="flex min-h-0 grow flex-col lg:flex-row">
        <main className="flex min-w-0 grow flex-col gap-4 p-4 sm:p-6">
          <FilterBar
            status={status}
            onChange={(next) => {
              setStatus(next);
              setOffset(0);
            }}
            requestLine={requestLine}
          />

          <TaskList
            tasks={tasks}
            loading={loading}
            error={error}
            onCycleStatus={handleCycleStatus}
            onEdit={(task) => {
              setEditing(task);
              setFormError(null);
              setDialogOpen(true);
            }}
            onDelete={(task) => setPendingDelete(task)}
            onNewTask={() => {
              setEditing(null);
              setFormError(null);
              setDialogOpen(true);
            }}
            onRetry={() => void load()}
          />

          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-muted">
              {tasks.length} shown · page {Math.floor(offset / PAGE_SIZE) + 1}
            </span>
            <div className="grow" />
            <span className="font-mono text-xs text-muted">
              limit={PAGE_SIZE} offset={offset}
            </span>
            <button
              type="button"
              disabled={offset === 0}
              onClick={() =>
                setOffset((current) => Math.max(0, current - PAGE_SIZE))
              }
              aria-label="Previous page"
              className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-sm text-text hover:bg-subtle disabled:opacity-40"
            >
              Prev
            </button>
            {/* GET /tasks returns a bare array with no total, so a short page is
                the only end-of-list signal we get. */}
            <button
              type="button"
              disabled={tasks.length < PAGE_SIZE}
              onClick={() => setOffset((current) => current + PAGE_SIZE)}
              aria-label="Next page"
              className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-sm text-text hover:bg-subtle disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </main>

        <aside className="shrink-0 border-t border-border p-4 sm:p-6 lg:w-87 lg:border-t-0 lg:border-l">
          <Calendar
            month={month}
            selected={selectedDay}
            tasks={calendarTasks}
            dayTasks={selectedDay && !loading ? tasks : []}
            onMonthChange={setMonth}
            onSelect={(day) => {
              setSelectedDay(day);
              setOffset(0);
            }}
          />
        </aside>
      </div>

      <TaskDialog
        key={dialogOpen ? (editing?.id ?? "new") : "closed"}
        open={dialogOpen}
        task={editing}
        submitting={submitting}
        error={formError}
        onClose={() => setDialogOpen(false)}
        onCreate={(input) => void handleCreate(input)}
        onUpdate={(id, input) => void handleUpdate(id, input)}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title={pendingDelete ? `Delete “${pendingDelete.title}”?` : ""}
        body="This cannot be undone."
        requestLine={
          pendingDelete ? `DELETE /tasks/${pendingDelete.id.slice(0, 8)}…` : ""
        }
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => void handleDelete()}
      />

      <Toast
        code={toast?.code ?? null}
        message={toast?.message ?? null}
        onDismiss={() => setToast(null)}
      />
    </div>
  );
}

export default App;
