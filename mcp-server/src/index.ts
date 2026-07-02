#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { publish } from "./git-publish.js";
import {
  addCountdownRow,
  addScheduleRow,
  closeEvent,
  createDraftEvent,
  editCountdownRow,
  editScheduleRow,
  getEvent,
  listApps,
  listEvents,
  setActiveEvent,
  setSelectedApp,
  setSelectedDisplayMode,
} from "./tools.js";

/**
 * REPO_ROOT is the only configuration this server takes: the absolute path,
 * on whatever machine this process runs on, to the cloned countdown-scheduler
 * repo. Every tool is hard-constrained to REPO_ROOT/data/ -- see fs-guard.ts.
 * This server is meant to be spawned as a local stdio child process by an AI
 * coding CLI; it is never network-exposed and is never given any secret.
 *
 * If REPO_ROOT isn't set explicitly, default to two directories up from this
 * built file (dist/index.js -> mcp-server -> repo root). That default holds
 * as long as this package stays at <repo>/mcp-server, which lets the repo's
 * own .mcp.json register this server with no machine-specific absolute path
 * committed anywhere.
 */
const builtFileDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(builtFileDir, "..", "..");
const REPO_ROOT = process.env.REPO_ROOT?.trim() || defaultRepoRoot;

function textResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorResult(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true,
  };
}

async function safe<T>(fn: () => Promise<T>) {
  try {
    return textResult(await fn());
  } catch (err) {
    return errorResult(err);
  }
}

const server = new McpServer({
  name: "countdown-scheduler-mcp",
  version: "0.1.0",
});

const eventStatusSchema = z.enum(["draft", "active", "ended"]);
const scheduleRowSchema = z.object({
  A: z.string(),
  B: z.string(),
  time: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Optional ISO datetime. Set this so the display can gray this row out once it's passed " +
        "and highlight it while it's next up; omit for rows with no reliable time.",
    ),
});
const countdownRowSchema = z.object({
  title: z.string().min(1),
  time: z.string().min(1),
});
const scheduleDaySchema = z.object({
  date: z.string(),
  announcement: z.string().default(""),
  rows: z.array(scheduleRowSchema).default([]),
});

server.registerTool(
  "list_apps",
  {
    title: "List apps",
    description:
      "Reads data/apps.json and returns each app's id, name, theme, activeEventId, " +
      "the current status of that active event (or null if it can't be found), which one " +
      "(isSelected / selectedAppId) is currently live on the primary display, and the " +
      "displayModeId readability preset currently applied to every display screen.",
    inputSchema: {},
  },
  async () => safe(() => listApps(REPO_ROOT)),
);

server.registerTool(
  "list_events",
  {
    title: "List events",
    description:
      "Enumerates every event under data/events and data/archive, optionally filtered by status.",
    inputSchema: {
      status: eventStatusSchema.optional(),
    },
  },
  async ({ status }) => safe(() => listEvents(REPO_ROOT, { status })),
);

server.registerTool(
  "get_event",
  {
    title: "Get event",
    description: "Returns the full JSON for one event, searching data/events then data/archive.",
    inputSchema: {
      eventId: z.string(),
    },
  },
  async ({ eventId }) => safe(() => getEvent(REPO_ROOT, eventId)),
);

server.registerTool(
  "create_draft_event",
  {
    title: "Create draft event",
    description: 'Creates data/events/<id>.json with status "draft", optionally seeded with content.',
    inputSchema: {
      appId: z.string(),
      id: z.string(),
      seed: z
        .object({
          announcement: z.string().optional(),
          countdownRows: z.array(countdownRowSchema).optional(),
          scheduleDays: z.array(scheduleDaySchema).optional(),
        })
        .optional(),
    },
  },
  async ({ appId, id, seed }) => safe(() => createDraftEvent(REPO_ROOT, appId, id, seed)),
);

server.registerTool(
  "add_schedule_row",
  {
    title: "Add schedule row",
    description:
      "Appends a row (fields A and B) under the scheduleDays entry for the given date, creating that " +
      "day entry if needed, and keeps scheduleDays sorted by date.",
    inputSchema: {
      eventId: z.string(),
      date: z.string(),
      row: scheduleRowSchema,
    },
  },
  async ({ eventId, date, row }) => safe(() => addScheduleRow(REPO_ROOT, eventId, date, row)),
);

server.registerTool(
  "edit_schedule_row",
  {
    title: "Edit schedule row",
    description: "Replaces one row (by date + rowIndex) in place.",
    inputSchema: {
      eventId: z.string(),
      date: z.string(),
      rowIndex: z.number().int().nonnegative(),
      row: scheduleRowSchema,
    },
  },
  async ({ eventId, date, rowIndex, row }) =>
    safe(() => editScheduleRow(REPO_ROOT, eventId, date, rowIndex, row)),
);

server.registerTool(
  "add_countdown_row",
  {
    title: "Add countdown row",
    description: "Appends a { title, time } row to the event's countdownRows.",
    inputSchema: {
      eventId: z.string(),
      title: z.string().min(1),
      time: z.string().min(1),
    },
  },
  async ({ eventId, title, time }) => safe(() => addCountdownRow(REPO_ROOT, eventId, title, time)),
);

server.registerTool(
  "edit_countdown_row",
  {
    title: "Edit countdown row",
    description: "Patches title and/or time on one countdownRows entry by index.",
    inputSchema: {
      eventId: z.string(),
      index: z.number().int().nonnegative(),
      patch: z.object({
        title: z.string().min(1).optional(),
        time: z.string().min(1).optional(),
      }),
    },
  },
  async ({ eventId, index, patch }) => safe(() => editCountdownRow(REPO_ROOT, eventId, index, patch)),
);

server.registerTool(
  "set_active_event",
  {
    title: "Set active event",
    description:
      'Sets data/apps.json\'s activeEventId for the given app, and flips the target event\'s status to "active".',
    inputSchema: {
      appId: z.string(),
      eventId: z.string(),
    },
  },
  async ({ appId, eventId }) => safe(() => setActiveEvent(REPO_ROOT, appId, eventId)),
);

server.registerTool(
  "set_selected_app",
  {
    title: "Set selected app (swap what's live on the display)",
    description:
      "Sets which app the primary display shows (data/apps.json's selectedAppId). This is the " +
      "remote control for what's currently running on the TV -- it does not change which event " +
      "is active within an app (see set_active_event for that). A screen loaded with an explicit " +
      "?app= URL parameter ignores this and stays pinned to that one app.",
    inputSchema: {
      appId: z.string(),
    },
  },
  async ({ appId }) => safe(() => setSelectedApp(REPO_ROOT, appId)),
);

server.registerTool(
  "set_selected_display_mode",
  {
    title: "Set selected display mode (readability preset for the physical TV)",
    description:
      "Sets data/apps.json's displayModeId, a readability preset for the physical display -- " +
      "high-contrast daylight colors, a dark/glare-reduction palette, or \"standard\" (each app's " +
      "own theme, unmodified). This applies on EVERY display screen, including one loaded with an " +
      "explicit ?app= URL parameter -- unlike set_selected_app, which a ?app=-pinned screen ignores. " +
      "It changes lighting/contrast only, never which app or event is showing.",
    inputSchema: {
      displayModeId: z.enum(["standard", "daylight-contrast", "dark-glare"]),
    },
  },
  async ({ displayModeId }) => safe(() => setSelectedDisplayMode(REPO_ROOT, displayModeId)),
);

server.registerTool(
  "close_event",
  {
    title: "Close event",
    description:
      'Sets status to "ended" and moves data/events/<id>.json to data/archive/<year>/<id>.json, where ' +
      "year is the year of the earliest date across the event's countdownRows and scheduleDays.",
    inputSchema: {
      eventId: z.string(),
    },
  },
  async ({ eventId }) => safe(() => closeEvent(REPO_ROOT, eventId)),
);

server.registerTool(
  "publish",
  {
    title: "Publish (commit + push data/)",
    description:
      "The only tool that touches git. Verifies every pending change is under data/ (aborting untouched " +
      "otherwise), then stages just data/, commits with the given message, and pushes. Returns the commit " +
      "hash and whether the push succeeded.",
    inputSchema: {
      message: z.string().min(1),
    },
  },
  async ({ message }) => safe(() => publish(REPO_ROOT, message)),
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Stdout is reserved for the JSON-RPC stream; all diagnostics go to stderr.
  console.error("countdown-scheduler-mcp: listening on stdio");
}

main().catch((err) => {
  console.error("countdown-scheduler-mcp: fatal error", err);
  process.exit(1);
});
