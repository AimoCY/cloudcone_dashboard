import { describe, it, expect, vi } from "vitest";
import { sendTelegram } from "./telegram.js";

describe("sendTelegram", () => {
  it("posts a message to the bot API with token and chat id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    await sendTelegram({ bot_token: "BOT", chat_id: "CHAT" }, "hello", fetchMock as unknown as typeof fetch);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/botBOT/sendMessage");
    expect(JSON.parse(init.body).chat_id).toBe("CHAT");
    expect(JSON.parse(init.body).text).toBe("hello");
  });

  it("does not throw when fetch rejects", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network"));
    await expect(
      sendTelegram({ bot_token: "BOT", chat_id: "CHAT" }, "x", fetchMock as unknown as typeof fetch),
    ).resolves.toBeUndefined();
  });

  it("is a no-op when bot token or chat id is empty", async () => {
    const fetchMock = vi.fn();
    await sendTelegram({ bot_token: "", chat_id: "" }, "x", fetchMock as unknown as typeof fetch);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
