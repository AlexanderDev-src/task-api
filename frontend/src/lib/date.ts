import type { Task, TaskQuery } from "./types.ts";

export const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

/** Local-time day key, "2026-09-08". Also the shape of an <input type="date">. */
export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** The day a task belongs to on the calendar: the local day it is due.
    Null when it has no due date. */
export function taskDayKey(task: Task): string | null {
  return task.due_at === null ? null : dayKey(new Date(task.due_at));
}

type DueRange = Required<Pick<TaskQuery, "due_from" | "due_before">>;

/** The `due_from` / `due_before` pair of GET /tasks for one local day.
    Both ends are local midnights turned into instants here, so the server
    never has to know the timezone, and a 23- or 25-hour day still fits. */
export function dayDueRange(day: Date): DueRange {
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const end = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
  return { due_from: start.toISOString(), due_before: end.toISOString() };
}

/** Same, for the whole local month that `month` falls in. */
export function monthDueRange(month: Date): DueRange {
  return {
    due_from: startOfMonth(month).toISOString(),
    due_before: addMonths(month, 1).toISOString(),
  };
}

/** A day key from an <input type="date"> as a `due_at` value.
    Noon, not midnight: the task stays on that day for a viewer whose clock
    is a few hours ahead or behind. */
export function dayKeyToDueAt(key: string): string {
  return new Date(`${key}T12:00:00`).toISOString();
}

export function sameDay(a: Date, b: Date): boolean {
  return dayKey(a) === dayKey(b);
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addMonths(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

/** Six-row Monday-first grid; days outside the month come back as null. */
export function monthMatrix(month: Date): (Date | null)[] {
  const first = startOfMonth(month);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < lead; i += 1) cells.push(null);
  for (let d = 1; d <= days; d += 1) {
    cells.push(new Date(first.getFullYear(), first.getMonth(), d));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function countByDay(tasks: Task[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const task of tasks) {
    const key = taskDayKey(task);
    if (key === null) continue;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

export function formatMonth(month: Date): string {
  return month.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

export function formatDayLong(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function formatDayShort(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
