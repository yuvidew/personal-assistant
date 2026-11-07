import { Daytona, type Sandbox } from "@daytona/sdk";
import { tool } from "ai";
import { z } from "zod";
import {
  downloadTelegramFile,
  sendTelegramFile,
} from "./telegram-api.js";

// Per-chat Daytona sandbox ("a computer") the assistant can use to work with files the
// user sends, run code, and drive a desktop. One sandbox per Telegram chat, found again
// by label so it survives across turns and runs. Daytona auto-stops it when idle.

const WORKDIR = "/home/daytona/files";
const AUTO_STOP_MINUTES = 30;
const MAX_OUTPUT_CHARS = 8000;

let daytona: Daytona | undefined;
function client() {
  return (daytona ??= new Daytona());
}

async function getSandbox(chatId: string): Promise<Sandbox> {
  const labels = { app: "telegram-agent", chat: chatId };
  let sandbox: Sandbox | undefined;
  for await (const s of client().list({ labels })) {
    sandbox = s;
    break;
  }
  if (!sandbox) {
    sandbox = await client().create({
      language: "python",
      labels,
      autoStopInterval: AUTO_STOP_MINUTES,
    });
  } else if (sandbox.state !== "started") {
    await sandbox.start();
  }
  await sandbox.fs.createFolder(WORKDIR, "755").catch(() => {});
  return sandbox;
}

// Keep paths inside the files folder unless the model passes an absolute path.
function resolvePath(p: string) {
  return p.startsWith("/") ? p : `${WORKDIR}/${p}`;
}

function safeName(name: string) {
  return name.replace(/[^\w.\- ]+/g, "_").slice(0, 100) || "file";
}

function clip(text: string) {
  return text.length > MAX_OUTPUT_CHARS
    ? `${text.slice(0, MAX_OUTPUT_CHARS)}\n...[truncated ${text.length - MAX_OUTPUT_CHARS} chars]`
    : text;
}

const computerAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("screenshot") }),
  z.object({
    action: z.literal("click"),
    x: z.number(),
    y: z.number(),
    button: z.enum(["left", "right", "middle"]).optional(),
    double: z.boolean().optional(),
  }),
  z.object({ action: z.literal("move"), x: z.number(), y: z.number() }),
  z.object({
    action: z.literal("drag"),
    fromX: z.number(),
    fromY: z.number(),
    toX: z.number(),
    toY: z.number(),
  }),
  z.object({ action: z.literal("type"), text: z.string() }),
  z.object({
    action: z.literal("key"),
    key: z.string().describe("Key or combo, e.g. 'enter', 'ctrl+s', 'alt+tab'"),
  }),
  z.object({
    action: z.literal("scroll"),
    x: z.number(),
    y: z.number(),
    direction: z.enum(["up", "down"]),
    amount: z.number().optional(),
  }),
  z.object({
    action: z.literal("openApp"),
    command: z.string().describe("Shell command that launches a GUI app, e.g. 'firefox https://example.com'"),
  }),
]);

type ScreenshotOutput = { ok: true; image?: string; note: string } | { ok: false; error: string };

/** Build the sandbox tools for one Telegram chat. */
export function createSandboxTools(chatId: string) {
  return {
    importUserFile: tool({
      description:
        "Copy a file the user sent in Telegram into your computer's files folder so you can read or edit it. Use the file_id from the attachment note in the user's message.",
      inputSchema: z.object({
        fileId: z.string().describe("The Telegram file_id from the attachment note"),
        filename: z.string().describe("Name to save it as, e.g. the original filename"),
      }),
      execute: async ({ fileId, filename }) => {
        try {
          const sandbox = await getSandbox(chatId);
          const { data } = await downloadTelegramFile(fileId);
          const path = `${WORKDIR}/${safeName(filename)}`;
          await sandbox.fs.uploadFile(data, path);
          return { ok: true, path, bytes: data.byteLength };
        } catch (err) {
          return { ok: false, error: String(err instanceof Error ? err.message : err) };
        }
      },
    }),

    runCommand: tool({
      description:
        "Run a shell command on your computer (Linux, Python 3 and Node available; pip/npm can install packages). Use it to inspect, convert, create or edit files, e.g. extract text from a PDF, add images to a PDF, build a spreadsheet. Files live in the files folder (relative paths resolve there).",
      inputSchema: z.object({
        command: z.string(),
        timeoutSeconds: z.number().int().min(1).max(240).optional(),
      }),
      execute: async ({ command, timeoutSeconds }) => {
        try {
          const sandbox = await getSandbox(chatId);
          const res = await sandbox.process.executeCommand(
            command,
            WORKDIR,
            undefined,
            timeoutSeconds ?? 120
          );
          return { exitCode: res.exitCode, output: clip(res.result ?? "") };
        } catch (err) {
          return { exitCode: -1, output: String(err instanceof Error ? err.message : err) };
        }
      },
    }),

    sendFileToUser: tool({
      description:
        "Send a file from your computer back to the user in the Telegram chat (document, or photo for png/jpg). Only call this once the file is final. Max 50 MB.",
      inputSchema: z.object({
        path: z.string().describe("Path to the file in the sandbox"),
        caption: z.string().optional().describe("Optional short caption"),
      }),
      execute: async ({ path, caption }) => {
        try {
          const sandbox = await getSandbox(chatId);
          const full = resolvePath(path);
          const data = await sandbox.fs.downloadFile(full);
          const filename = full.split("/").pop() || "file";
          await sendTelegramFile(chatId, data, filename, caption);
          return { ok: true, sent: filename, bytes: data.byteLength };
        } catch (err) {
          return { ok: false, error: String(err instanceof Error ? err.message : err) };
        }
      },
    }),

    computer: tool({
      description:
        "Control a Linux desktop on your computer: take screenshots, click, type, press keys, scroll, open apps. Take a screenshot first to see the screen, and again after actions to check the result. Prefer runCommand for anything that doesn't need a GUI.",
      inputSchema: computerAction,
      execute: async (input): Promise<ScreenshotOutput> => {
        try {
          const sandbox = await getSandbox(chatId);
          const cu = sandbox.computerUse;
          // Start the desktop (Xvfb/xfce/vnc). Ignore "already running" errors.
          await cu.start().catch(() => {});

          switch (input.action) {
            case "screenshot":
              break;
            case "click":
              await cu.mouse.click(input.x, input.y, input.button, input.double);
              break;
            case "move":
              await cu.mouse.move(input.x, input.y);
              break;
            case "drag":
              await cu.mouse.drag(input.fromX, input.fromY, input.toX, input.toY);
              break;
            case "type":
              await cu.keyboard.type(input.text);
              break;
            case "key":
              await cu.keyboard.hotkey(input.key);
              break;
            case "scroll":
              await cu.mouse.scroll(input.x, input.y, input.direction, input.amount);
              break;
            case "openApp":
              await sandbox.process.executeCommand(
                `DISPLAY=:0 nohup ${input.command} >/dev/null 2>&1 &`,
                WORKDIR
              );
              await new Promise((r) => setTimeout(r, 3000));
              break;
          }

          // Small JPEG keeps the transcript and token cost down.
          const shot = await cu.screenshot.takeCompressed({
            format: "jpeg",
            quality: 60,
            scale: 0.6,
          });
          return {
            ok: true,
            image: shot.screenshot,
            note: `${input.action} done. Screenshot is scaled to 60%; coordinates you pass must be in full-size screen pixels (divide what you see by 0.6).`,
          };
        } catch (err) {
          return { ok: false, error: String(err instanceof Error ? err.message : err) };
        }
      },
      // The model sees the screenshot as an image; the base64 never goes in as text.
      toModelOutput: ({ output }) => {
        const o = output as ScreenshotOutput;
        if (!o.ok) return { type: "error-text", value: o.error };
        if (!o.image) return { type: "text", value: o.note };
        return {
          type: "content",
          value: [
            { type: "text", text: o.note },
            {
              type: "file",
              data: { type: "data", data: o.image },
              mediaType: "image/jpeg",
            },
          ],
        };
      },
    }),
  };
}
