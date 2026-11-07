import { webhooks } from "@trigger.dev/sdk";
import { chat, defaultStorage } from "@trigger.dev/sdk/ai";
import { stepCountIs } from "ai";
import { AlexandriaTools, scrape as scrapePage } from "firecrawl-aisdk";
import { model } from "../ai.js";
import { createSandboxTools } from "./sandbox-tools.js";
import { sendTelegramMessage } from "./telegram-api.js";
import { buildTelegramInstructions } from "./telegram-instructions.js";

type TelegramFile = { file_id: string; file_name?: string; mime_type?: string; file_size?: number };

type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number };
    from?: { id: number };
    text?: string;
    caption?: string;
    document?: TelegramFile;
    photo?: Array<TelegramFile & { width: number; height: number }>;
    voice?: TelegramFile;
    audio?: TelegramFile;
    video?: TelegramFile;
    video_note?: TelegramFile;
    sticker?: { emoji?: string };
  };
};

// Describe each attachment as text. The model never receives raw bytes: it calls
// `importUserFile` with the file_id to copy the file into its sandbox, then works on it there.
// (Keeps this model-agnostic: no PDF/file-part support is needed from the LLM.)
function describeAttachments(m: NonNullable<TelegramUpdate["message"]>): string[] {
  const kb = (f: TelegramFile) => (f.file_size ? `, ${(f.file_size / 1024).toFixed(1)} KB` : "");
  const lines: string[] = [];
  if (m.document) {
    const d = m.document;
    lines.push(
      `[Attached file: name="${d.file_name ?? "document"}", type=${d.mime_type ?? "unknown"}${kb(d)}, file_id=${d.file_id}]`
    );
  }
  if (m.photo?.length) {
    // Telegram sends several sizes; the last is the largest.
    const p = m.photo[m.photo.length - 1];
    lines.push(`[Attached photo: ${p.width}x${p.height}${kb(p)}, suggested name="photo-${p.file_id.slice(-8)}.jpg", file_id=${p.file_id}]`);
  }
  const media: Array<[string, TelegramFile | undefined, string]> = [
    ["voice message", m.voice, "ogg"],
    ["audio", m.audio, "mp3"],
    ["video", m.video, "mp4"],
    ["video note", m.video_note, "mp4"],
  ];
  for (const [label, f, ext] of media) {
    if (f) {
      lines.push(
        `[Attached ${label}: name="${f.file_name ?? `${label.replace(" ", "-")}.${ext}`}", type=${f.mime_type ?? "unknown"}${kb(f)}, file_id=${f.file_id}]`
      );
    }
  }
  if (m.sticker) lines.push(`[Sticker ${m.sticker.emoji ?? ""}]`);
  return lines;
}

// Hosted inbound webhook. Trigger.dev verifies Telegram's secret-token header
// (set via `setWebhook`'s `secret_token`) before anything reaches the agent, and
// de-duplicates retried deliveries on `update_id`.
export const telegramEndpoint = webhooks.endpoint.define({
  id: "telegram",
  source: webhooks.custom<TelegramUpdate>(
    {
      scheme: "shared-secret",
      placement: "header",
      fieldName: "x-telegram-bot-api-secret-token",
      idempotencyField: { from: "body", name: "update_id" },
    },
    {
      setupPrompt:
        "Call the Telegram Bot API `setWebhook` with this URL and `secret_token` set to the signing secret.",
    }
  ),
});

// One session per Telegram chat: `key` is the chat id, so every message from the same
// chat reaches the same conversation, and a later run picks the history back up.
const telegram = chat.channels.custom({
  id: "telegram",
  endpoint: telegramEndpoint,
  key: "{event.message.chat.id}",
  // Accept any new message (text, files, photos, voice, ...). Edits, joins and other
  // update types have no `message` and are ignored.
  filter: "event.message != null",
  inbound: (update) => {
    const m = update.message;
    const text = m?.text ?? m?.caption ?? "";
    const attachments = m ? describeAttachments(m) : [];
    return {
      message: [text, ...attachments].filter(Boolean).join("\n") || "[Empty message]",
      externalMessageId: String(m?.message_id ?? ""),
      externalUserId: m?.from ? String(m.from.id) : undefined,
    };
  },
  outbound: (reply) => (reply.text ? { text: reply.text } : null),
  send: async (message, ctx) => {
    const chatId = ctx.event?.message?.chat.id;
    if (chatId === undefined) return {};
    await sendTelegramMessage(chatId, message.text);
    return {};
  },
});

// Live-information tools. Customers never see these names; the instructions tell the
// model to decide on its own when a request needs fresh data and to never mention them.
//   search / findTools / scrape: web search plus specialised live data sources
//   readPage: read the full contents of a specific web page
const { search, findTools, scrape: runDataSource } = AlexandriaTools();
const tools = {
  search,
  findTools,
  scrape: runDataSource,
  readPage: scrapePage,
};

export const telegramAgent = chat.agent({
  id: "telegram-agent",
  channels: [telegram],
  // Declared here AND passed to streamText below, so tool output formatting is
  // re-applied when history is rebuilt on later turns.
  tools,
  // Transcript persistence: the conversation (UIMessages) is stored by the platform in
  // object storage, keyed by the Telegram chat id. No database needed. Each turn the
  // runtime rebuilds the model's context from it, so memory survives idle gaps,
  // deploys and fresh runs. (This is the default; it is set explicitly for clarity.)
  storage: defaultStorage,
  run: async ({ messages, tools, signal, streamText, chatId }) =>
    streamText({
      model,
      system: buildTelegramInstructions(),
      messages,
      // chatId is the Telegram chat id (the channel session key), so the sandbox tools can
      // scope the per-chat computer and send files back to the right chat.
      tools: { ...tools, ...createSandboxTools(chatId) },
      abortSignal: signal,
      stopWhen: stepCountIs(15),
    }),
});
