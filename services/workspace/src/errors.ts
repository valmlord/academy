// Every dedicated error of the service (design section 10). Messages name the entity and a closed rule or
// reason, never a value read from the environment, a file or Docker, so they are safe to log and to answer.

/** An environment variable is missing or breaks its rule. The message never carries the value. */
export class InvalidConfigError extends Error {
  readonly variable: string;
  readonly rule: string;

  constructor(variable: string, rule: string) {
    super(`${variable}: ${rule}`);
    this.name = "InvalidConfigError";
    this.variable = variable;
    this.rule = rule;
  }
}

/** One part of a workspace key breaks its rule. Names the field only: the value is request input. */
export class InvalidWorkspaceKeyError extends Error {
  readonly field: string;

  constructor(field: string) {
    super(`invalid workspace key: ${field}`);
    this.name = "InvalidWorkspaceKeyError";
    this.field = field;
  }
}
