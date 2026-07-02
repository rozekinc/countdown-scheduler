import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export class NonDataChangeError extends Error {}

/**
 * Parses the output of `git status --porcelain` (v1 short format) into a
 * flat list of changed paths. Handles renames ("old -> new", both sides are
 * reported as changed) and paths that git has quoted because they contain
 * spaces or non-ASCII characters.
 */
export function parsePorcelainStatus(output: string): string[] {
  const paths: string[] = [];
  for (const rawLine of output.split("\n")) {
    if (rawLine.length < 4) continue; // shortest possible: "XY p"
    const rest = rawLine.slice(3); // "XY" (2 chars) + separating space (1 char)
    const arrowIdx = rest.indexOf(" -> ");
    if (arrowIdx !== -1) {
      paths.push(unquotePath(rest.slice(0, arrowIdx)));
      paths.push(unquotePath(rest.slice(arrowIdx + 4)));
    } else {
      paths.push(unquotePath(rest));
    }
  }
  return paths;
}

function unquotePath(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed
      .slice(1, -1)
      .replace(/\\"/g, '"')
      .replace(/\\t/g, "\t")
      .replace(/\\n/g, "\n")
      .replace(/\\\\/g, "\\");
  }
  return trimmed;
}

/**
 * Enforces the "this server only ever touches data/" guarantee at publish
 * time, independent of whatever any individual tool believes it did. Throws
 * NonDataChangeError (without side effects) if any changed path -- staged,
 * unstaged, or untracked -- falls outside data/.
 */
export function assertDataOnlyChanges(paths: string[]): void {
  const offending = paths.filter((p) => p.length > 0 && !p.startsWith("data/"));
  if (offending.length > 0) {
    throw new NonDataChangeError(
      `refusing to publish: found changes outside data/, so nothing was staged or committed: ${offending.join(", ")}`,
    );
  }
}

export interface PublishResult {
  noop: boolean;
  message: string;
  commitHash?: string;
  pushed?: boolean;
  pushOutput?: string;
}

/**
 * The only function in this server allowed to invoke git. Guards, stages,
 * commits, and pushes -- but only ever the data/ directory, and only after
 * independently re-verifying that every pending change lives under data/.
 */
export async function publish(repoRoot: string, message: string): Promise<PublishResult> {
  if (typeof message !== "string" || message.trim().length === 0) {
    throw new Error("publish message must be a non-empty string");
  }

  const status = await execFileAsync("git", ["status", "--porcelain"], { cwd: repoRoot });
  const changedPaths = parsePorcelainStatus(status.stdout);

  if (changedPaths.length === 0) {
    return { noop: true, message: "No changes to publish; working tree is already clean." };
  }

  // Throws and changes nothing if anything outside data/ is dirty.
  assertDataOnlyChanges(changedPaths);

  await execFileAsync("git", ["add", "-A", "--", "data"], { cwd: repoRoot });
  await execFileAsync("git", ["commit", "-m", message], { cwd: repoRoot });

  const revParse = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repoRoot });
  const commitHash = revParse.stdout.trim();

  try {
    const pushResult = await execFileAsync("git", ["push"], { cwd: repoRoot });
    return {
      noop: false,
      message: `Committed and pushed ${commitHash}.`,
      commitHash,
      pushed: true,
      pushOutput: `${pushResult.stdout}${pushResult.stderr}`.trim(),
    };
  } catch (err) {
    const execErr = err as { stderr?: string; stdout?: string; message?: string };
    return {
      noop: false,
      message: `Committed ${commitHash} locally, but "git push" failed. Push it yourself once the issue is fixed.`,
      commitHash,
      pushed: false,
      pushOutput: (execErr.stderr || execErr.stdout || execErr.message || "unknown error").trim(),
    };
  }
}
