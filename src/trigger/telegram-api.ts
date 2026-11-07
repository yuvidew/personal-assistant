// Thin Telegram Bot API helpers shared by the Telegram agent and its tools.

const TELEGRAM_MAX_LENGTH = 4096;
// Bot API limits: bots can download files up to 20 MB and upload up to 50 MB.
export const TELEGRAM_MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;
export const TELEGRAM_MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

function api(method: string) {
  return `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`;
}

export async function sendTelegramMessage(chatId: number | string, text: string) {
  const res = await fetch(api("sendMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: text.slice(0, TELEGRAM_MAX_LENGTH) || "..." }),
  });
  if (!res.ok) throw new Error(`Telegram sendMessage failed: ${res.status} ${await res.text()}`);
}

/** Download a file the user sent, by its Telegram `file_id`. */
export async function downloadTelegramFile(
  fileId: string
): Promise<{ data: Buffer; telegramPath: string }> {
  const metaRes = await fetch(api("getFile"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_id: fileId }),
  });
  const meta = (await metaRes.json()) as {
    ok: boolean;
    description?: string;
    result?: { file_path?: string; file_size?: number };
  };
  if (!meta.ok || !meta.result?.file_path) {
    throw new Error(`Telegram getFile failed: ${meta.description ?? metaRes.status}`);
  }
  if ((meta.result.file_size ?? 0) > TELEGRAM_MAX_DOWNLOAD_BYTES) {
    throw new Error("File is larger than the 20 MB limit for bot downloads.");
  }
  const fileRes = await fetch(
    `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${meta.result.file_path}`
  );
  if (!fileRes.ok) throw new Error(`Telegram file download failed: ${fileRes.status}`);
  return {
    data: Buffer.from(await fileRes.arrayBuffer()),
    telegramPath: meta.result.file_path,
  };
}

const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;

/** Send a file back to the user. Images go as photos (inline preview); everything else as a document. */
export async function sendTelegramFile(
  chatId: number | string,
  data: Buffer,
  filename: string,
  caption?: string
) {
  if (data.byteLength > TELEGRAM_MAX_UPLOAD_BYTES) {
    throw new Error("File is larger than the 50 MB limit for bot uploads.");
  }
  // Photos are capped at 10 MB; larger images fall back to documents.
  const asPhoto = IMAGE_EXT.test(filename) && data.byteLength <= 10 * 1024 * 1024;
  const form = new FormData();
  form.set("chat_id", String(chatId));
  if (caption) form.set("caption", caption.slice(0, 1024));
  form.set(asPhoto ? "photo" : "document", new Blob([new Uint8Array(data)]), filename);
  const res = await fetch(api(asPhoto ? "sendPhoto" : "sendDocument"), {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(`Telegram send file failed: ${res.status} ${await res.text()}`);
}
