import { describe, it, expect, vi } from "vitest";
import { Telegram } from "./telegram.js";

describe("Telegram", () => {
  it("posts a message to the bot API with token and chat id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    const tg = new Telegram("BOT", "CHAT", fetchMock as unknown as typeof fetch);
    await tg.send("hello");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/botBOT/sendMessage");
    expect(JSON.parse(init.body).chat_id).toBe("CHAT");
    expect(JSON.parse(init.body).text).toBe("hello");
  });

  it("does not throw when fetch rejects", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network"));
    const tg = new Telegram("BOT", "CHAT", fetchMock as unknown as typeof fetch);
    await expect(tg.send("x")).resolves.toBeUndefined();
  });

  it("is a no-op when bot token is empty", async () => {
    const fetchMock = vi.fn();
    const tg = new Telegram("", "", fetchMock as unknown as typeof fetch);
    await tg.send("x");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
