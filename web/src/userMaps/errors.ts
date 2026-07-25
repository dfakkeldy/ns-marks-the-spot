export type UserMapImportErrorCode =
  | "unsupported-type"
  | "corrupt-file"
  | "unsupported-crs"
  | "no-georeferencing"
  | "too-large"
  | "quota"
  | "storage-failed";

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
