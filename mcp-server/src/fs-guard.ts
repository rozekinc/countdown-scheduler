import path from "node:path";

/**
 * Every tool in this server is only allowed to touch files under
 * REPO_ROOT/data/. These helpers are the single choke point that enforces
 * that boundary -- both by validating the shape of ids/paths coming in from
 * tool arguments, and by re-checking the final resolved path never escapes
 * the data/ directory (defense in depth against ".." tricks, absolute
 * paths, symlink-looking segments, etc).
 */

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class InvalidArgumentError extends Error {}

/**
 * Validates a single path segment meant to be used as an id (event id, app
 * id, year directory, etc). Rejects anything that could plausibly be used
 * for path traversal or that isn't a simple token.
 */
export function assertSafeId(label: string, value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new InvalidArgumentError(`${label} must be a non-empty string`);
  }
  if (value.includes("..") || value.includes("/") || value.includes("\\")) {
    throw new InvalidArgumentError(
      `${label} must not contain "..", "/", or "\\" (got ${JSON.stringify(value)})`,
    );
  }
  if (!ID_PATTERN.test(value)) {
    throw new InvalidArgumentError(
      `${label} must match ${ID_PATTERN} (got ${JSON.stringify(value)})`,
    );
  }
  return value;
}

/** Validates a plain ISO calendar date string, e.g. "2026-07-10". */
export function assertSafeDate(label: string, value: unknown): string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) {
    throw new InvalidArgumentError(
      `${label} must be a YYYY-MM-DD date string (got ${JSON.stringify(value)})`,
    );
  }
  return value;
}

/** Absolute path to REPO_ROOT/data, resolved once. */
export function dataDir(repoRoot: string): string {
  return path.resolve(repoRoot, "data");
}

/**
 * Joins already-validated path segments onto REPO_ROOT/data and re-verifies
 * the resolved, normalized path is still inside that directory before
 * returning it. Never pass unvalidated user input as a segment -- validate
 * each id/date with assertSafeId / assertSafeDate first.
 */
export function resolveInData(repoRoot: string, ...segments: string[]): string {
  const base = dataDir(repoRoot);
  const target = path.resolve(base, ...segments);
  if (target !== base && !target.startsWith(base + path.sep)) {
    throw new InvalidArgumentError(
      `resolved path escapes data/ directory: ${JSON.stringify(segments)}`,
    );
  }
  return target;
}
