export type UserMapImportErrorCode =
  | "unsupported-type"
  | "corrupt-file"
  | "password-protected"
  | "unsupported-crs"
  | "invalid-georeferencing"
  | "too-large"
  | "quota"
  | "storage-failed"
  // Vector-data imports. "missing-crs" (no .prj at all) is deliberately
  // distinct from "unsupported-crs" (a declared CRS we can't use): the first
  // asks the user to re-export with projection info, the second tells them
  // the projection itself is the problem.
  | "empty-file"
  | "too-many-features"
  | "missing-crs";

/**
 * Import failures are expected user events, not bugs, so every one carries a
 * message written for the UI rather than the console.
 */
export class UserMapImportError extends Error {
  readonly code: UserMapImportErrorCode;
  readonly userMessage: string;

  constructor(code: UserMapImportErrorCode, userMessage: string) {
    super(`${code}: ${userMessage}`);
    this.name = "UserMapImportError";
    this.code = code;
    this.userMessage = userMessage;
  }
}
