export type Violation = {
  field: string;
  message: string;
};

/** A value that parsed fine but breaks a rule. One line per violation. */
export class ValidationError extends Error {
  constructor(violations: Violation[]) {
    super(violations.map((v) => `${v.field}: ${v.message}`).join("\n"));
    this.name = "ValidationError";
  }
}

export class TaskNotFoundError extends Error {
  constructor() {
    super("task not found");
    this.name = "TaskNotFoundError";
  }
}
