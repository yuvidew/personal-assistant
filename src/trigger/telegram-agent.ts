import { webhooks } from "@trigger.dev/sdk";
import { chat } from "@trigger.dev/sdk/ai";
import { defaultStorage } from "@trigger.dev/sdk/ai";
import { stepCountIs } from "ai";
import { model } from "../ai.js";

type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number };
    text?: string;
  };
};

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

const TELEGRAM_MAX_LENGTH = 4096;

async function sendTelegramMessage(chatId: number, text: string) {
  const res = await fetch(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: text.slice(0, TELEGRAM_MAX_LENGTH) || "..." }),
    }
  );
  if (!res.ok) throw new Error(`Telegram sendMessage failed: ${res.status} ${await res.text()}`);
}

// One session per Telegram chat: `key` is the chat id, so every message from the same
// chat reaches the same conversation, and a later run picks the history back up.
const telegram = chat.channels.custom({
  id: "telegram",
  endpoint: telegramEndpoint,
  key: "{event.message.chat.id}",
  // Ignore updates that aren't text messages (edits, stickers, joins, ...).
  filter: "event.message.text != null",
  inbound: (update) => ({
    message: update.message?.text ?? "",
    externalMessageId: String(update.message?.message_id ?? ""),
  }),
  outbound: (reply) => (reply.text ? { text: reply.text } : null),
  send: async (message, ctx) => {
    const chatId = ctx.event?.message?.chat.id;
    if (chatId === undefined) return {};
    await sendTelegramMessage(chatId, message.text);
    return {};
  },
});

export const telegramAgent = chat.agent({
  id: "telegram-agent",
  channels: [telegram],
  // Transcript persistence: the conversation (UIMessages) is stored by the platform in
  // object storage, keyed by the Telegram chat id. No database needed. Each turn the
  // runtime rebuilds the model's context from it, so memory survives idle gaps,
  // deploys and fresh runs. (This is the default; it is set explicitly for clarity.)
  storage: defaultStorage,
  run: async ({ messages, signal, streamText }) =>
    streamText({
      model,
      system:
        "You are a helpful personal assistant on Telegram. Keep replies concise and plain text.",
      messages,
      abortSignal: signal,
      stopWhen: stepCountIs(10),
    }),
});
