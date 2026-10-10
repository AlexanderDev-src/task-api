import type { Task } from "../lib/types.ts";
import {
  WEEKDAYS,
  countByDay,
  dayKey,
  formatDayLong,
  formatMonth,
  monthMatrix,
  sameDay,
} from "../lib/date.ts";
import { Icon } from "./Icon.tsx";
import { StatusMark } from "./StatusMark.tsx";

type CalendarProps = {
  month: Date;
  selected: Date | null;
  /** Tasks due in `month`: they decide which days get a dot. */
  tasks: Task[];
  /** Tasks due on `selected`, as the backend filtered them. */
  dayTasks: Task[];
  onMonthChange: (month: Date) => void;
  onSelect: (day: Date | null) => void;
};

export function Calendar({
  month,
  selected,
  tasks,
  dayTasks,
  onMonthChange,
  onSelect,
}: CalendarProps) {
  const cells = monthMatrix(month);
  const counts = countByDay(tasks);
  const today = new Date();

  const step = (delta: number) =>
    onMonthChange(new Date(month.getFullYear(), month.getMonth() + delta, 1));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-head">{formatMonth(month)}</span>
        <div className="grow" />
        <button
          type="button"
          onClick={() => step(-1)}
          aria-label="Previous month"
          className="inline-flex size-8 items-center justify-center rounded-lg border border-border text-muted hover:bg-subtle"
        >
          <Icon name="chevronLeft" size={14} />
        </button>
        <button
          type="button"
          onClick={() => step(1)}
          aria-label="Next month"
          className="inline-flex size-8 items-center justify-center rounded-lg border border-border text-muted hover:bg-subtle"
        >
          <Icon name="chevronRight" size={14} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {WEEKDAYS.map((label, index) => (
          <div
            key={`${label}-${index}`}
            className="pb-0.5 text-center text-[11px] tracking-wide text-muted"
          >
            {label}
          </div>
        ))}

        {cells.map((day, index) => {
          if (!day) return <div key={`pad-${index}`} className="h-10" />;

          const key = dayKey(day);
          const isSelected = selected ? sameDay(day, selected) : false;
          const isToday = sameDay(day, today);
          const count = counts[key] ?? 0;

          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(isSelected ? null : day)}
              aria-pressed={isSelected}
              className={`flex h-10 flex-col items-center justify-center gap-0.5 rounded-lg border text-[13px] transition-colors ${
                isSelected
                  ? "border-accent-border bg-accent-bg text-accent"
                  : isToday
                    ? "border-border text-head"
                    : "border-transparent text-head hover:bg-subtle"
              }`}
            >
              <span>{day.getDate()}</span>
              <span
                className={`size-1 rounded-full ${
                  count === 0 ? "bg-transparent" : isSelected ? "bg-accent" : "bg-muted"
                }`}
              />
            </button>
          );
        })}
      </div>

      <div className="h-px bg-border" />

      <div className="flex items-center gap-2 text-muted">
        <Icon name="calendar" size={15} />
        <span className="text-[13px] font-semibold text-head">
          {selected ? formatDayLong(selected) : "All days"}
        </span>
        <span className="text-xs">
          {selected ? `${dayTasks.length} task${dayTasks.length === 1 ? "" : "s"}` : ""}
        </span>
      </div>

      {selected ? (
        dayTasks.length > 0 ? (
          <div className="flex flex-col gap-2">
            {dayTasks.map((task) => (
              <div
                key={task.id}
                className="flex items-center gap-2.5 rounded-lg border border-border bg-panel px-3 py-2.5"
              >
                <StatusMark status={task.status} size={14} />
                <span className="truncate text-[13px] text-head">{task.title}</span>
              </div>
            ))}
          </div>
        ) : (
          <span className="text-xs text-muted">Nothing on this day.</span>
        )
      ) : (
        <span className="text-xs text-muted">Pick a day to filter the list.</span>
      )}
    </div>
  );
}
