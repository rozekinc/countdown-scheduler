// Ad-hoc scratch tests for the MCP server's tool logic. Run after `npm run
// build`: `node test/scratch-test.mjs`. Exercises everything against a
// throwaway temp directory it creates itself -- never the repo's own data/.
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { addScheduleRow, closeEvent, createDraftEvent } from "../dist/tools.js";
import { parsePorcelainStatus, assertDataOnlyChanges, NonDataChangeError } from "../dist/git-publish.js";
import { InvalidArgumentError } from "../dist/fs-guard.js";

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    failures++;
    console.error(`NOT OK - ${name}`);
    console.error(err);
  }
}
async function checkAsync(name, fn) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    failures++;
    console.error(`NOT OK - ${name}`);
    console.error(err);
  }
}

async function withScratchRepo(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), "countdown-scheduler-mcp-test-"));
  await mkdir(path.join(dir, "data", "events"), { recursive: true });
  await writeFile(
    path.join(dir, "data", "apps.json"),
    JSON.stringify(
      {
        apps: [
          {
            id: "web1",
            name: "Web1",
            theme: { primary: "#e60000", accent: "#484848", background: "#ffffff" },
            activeEventId: "sample-event",
          },
        ],
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function main() {
  // --- add_schedule_row ---
  await checkAsync("add_schedule_row creates a day entry and appends a row", async () => {
    await withScratchRepo(async (repoRoot) => {
      await createDraftEvent(repoRoot, "web1", "sample-event");
      const data = await addScheduleRow(repoRoot, "sample-event", "2026-07-10", { A: "10:00", B: "Opening" });
      assert.equal(data.scheduleDays.length, 1);
      assert.equal(data.scheduleDays[0].date, "2026-07-10");
      assert.deepEqual(data.scheduleDays[0].rows, [{ A: "10:00", B: "Opening" }]);

      // Second row on the same day appends, doesn't duplicate the day entry.
      const data2 = await addScheduleRow(repoRoot, "sample-event", "2026-07-10", { A: "11:00", B: "Talk" });
      assert.equal(data2.scheduleDays.length, 1);
      assert.equal(data2.scheduleDays[0].rows.length, 2);

      // A row on an earlier date creates a new day entry and scheduleDays stays sorted.
      const data3 = await addScheduleRow(repoRoot, "sample-event", "2026-07-09", { A: "09:00", B: "Setup" });
      assert.equal(data3.scheduleDays.length, 2);
      assert.deepEqual(
        data3.scheduleDays.map((d) => d.date),
        ["2026-07-09", "2026-07-10"],
      );

      // File on disk matches what was returned.
      const onDisk = JSON.parse(await readFile(path.join(repoRoot, "data", "events", "sample-event.json"), "utf8"));
      assert.deepEqual(onDisk, data3);
    });
  });

  await checkAsync("add_schedule_row rejects a malformed row", async () => {
    await withScratchRepo(async (repoRoot) => {
      await createDraftEvent(repoRoot, "web1", "sample-event");
      await assert.rejects(() => addScheduleRow(repoRoot, "sample-event", "2026-07-10", { A: "only-a" }));
    });
  });

  await checkAsync("add_schedule_row rejects a path-traversal eventId", async () => {
    await withScratchRepo(async (repoRoot) => {
      await assert.rejects(
        () => addScheduleRow(repoRoot, "../../etc/passwd", "2026-07-10", { A: "x", B: "y" }),
        InvalidArgumentError,
      );
    });
  });

  // --- close_event ---
  await checkAsync("close_event moves the file to data/archive/<year>/ and sets status ended", async () => {
    await withScratchRepo(async (repoRoot) => {
      await createDraftEvent(repoRoot, "web1", "sample-event", {
        countdownRows: [{ title: "Doors open", time: "2026-07-10T13:00:00+09:00" }],
      });
      const result = await closeEvent(repoRoot, "sample-event");
      assert.equal(result.status, "ended");
      assert.equal(result.archivedPath, "data/archive/2026/sample-event.json");

      // Original file gone, archived file present with status ended.
      await assert.rejects(() => readFile(path.join(repoRoot, "data", "events", "sample-event.json"), "utf8"));
      const archived = JSON.parse(
        await readFile(path.join(repoRoot, "data", "archive", "2026", "sample-event.json"), "utf8"),
      );
      assert.equal(archived.status, "ended");
      assert.equal(archived.id, "sample-event");
    });
  });

  await checkAsync("close_event refuses to double-archive", async () => {
    await withScratchRepo(async (repoRoot) => {
      await createDraftEvent(repoRoot, "web1", "sample-event", {
        countdownRows: [{ title: "Doors open", time: "2026-07-10T13:00:00+09:00" }],
      });
      await closeEvent(repoRoot, "sample-event");
      await assert.rejects(() => closeEvent(repoRoot, "sample-event"));
    });
  });

  // --- publish path-guard logic (stubbed porcelain input, no real git repo needed) ---
  check("parsePorcelainStatus parses plain modified/untracked/added lines", () => {
    const out = [" M data/events/sample-event.json", "?? data/events/new-event.json", "A  data/apps.json"].join(
      "\n",
    );
    const paths = parsePorcelainStatus(out);
    assert.deepEqual(paths, ["data/events/sample-event.json", "data/events/new-event.json", "data/apps.json"]);
  });

  check("parsePorcelainStatus parses renames as two paths", () => {
    const out = "R  data/events/old-id.json -> data/events/new-id.json";
    const paths = parsePorcelainStatus(out);
    assert.deepEqual(paths, ["data/events/old-id.json", "data/events/new-id.json"]);
  });

  check("assertDataOnlyChanges passes when every path is under data/", () => {
    assertDataOnlyChanges(["data/apps.json", "data/events/sample-event.json"]);
  });

  check("assertDataOnlyChanges throws NonDataChangeError when src/ is dirty", () => {
    assert.throws(
      () => assertDataOnlyChanges(["data/apps.json", "src/main.ts"]),
      NonDataChangeError,
    );
  });

  check("assertDataOnlyChanges throws when mcp-server/ itself is dirty", () => {
    assert.throws(
      () => assertDataOnlyChanges(["mcp-server/src/index.ts"]),
      NonDataChangeError,
    );
  });

  check("publish guard: realistic mixed status output is rejected wholesale", () => {
    const out = [
      " M data/apps.json",
      " M README.md",
      "?? data/events/new-event.json",
    ].join("\n");
    const paths = parsePorcelainStatus(out);
    assert.throws(() => assertDataOnlyChanges(paths), NonDataChangeError);
  });

  if (failures > 0) {
    console.error(`\n${failures} test(s) failed`);
    process.exit(1);
  } else {
    console.log("\nall tests passed");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
