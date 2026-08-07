export const FOCUS_ERROR_CODES = [
  "VALIDATION_ERROR",
  "UNAUTHORIZED",
  "NOT_FOUND",
  "INVALID_TRANSITION",
  "ACTIVE_SESSION_EXISTS",
  "REVISION_CONFLICT",
  "DATABASE_ERROR",
] as const;

export type FocusErrorCode = (typeof FOCUS_ERROR_CODES)[number];

/** Domain error safe for UI mapping. Never includes private session content. */
export class FocusError extends Error {
  readonly code: FocusErrorCode;
  readonly fieldErrors?: Record<string, string[]>;

  constructor(
    code: FocusErrorCode,
    message: string,
    fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "FocusError";
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export function isFocusError(error: unknown): error is FocusError {
  return error instanceof FocusError;
}

export type FocusActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: FocusErrorCode;
        message: string;
        fieldErrors?: Record<string, string[]>;
      };
    };
