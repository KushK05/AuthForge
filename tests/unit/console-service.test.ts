import { describe, expect, it } from "vitest";

import { ConsoleService } from "../../src/modules/developer-console/console-service.js";
import { MemoryShowcaseStore } from "../../src/platform/memory-store.js";

describe("ConsoleService", () => {
  it("returns formatted state summaries", async () => {
    const state = await new ConsoleService(new MemoryShowcaseStore()).getState();
    expect(state.api_keys).toEqual([]);
    expect(state.sessions).toEqual([]);
    expect(state.events).toEqual([]);
  });

  it("summarises API keys without secret material", async () => {
    const store = new MemoryShowcaseStore();
    await store.createApiKey({ id: "6f1d1c7e-7d62-4a5c-9d57-2d9b1f1a7a01", name: "demo", prefix: "sk_demo", secretDigest: Buffer.from("digest"), createdAt: new Date() }, 10);
    const [key] = (await new ConsoleService(store).getState()).api_keys;
    expect(key).toMatchObject({ name: "demo", prefix: "sk_demo" });
    expect(key).not.toHaveProperty("secretDigest");
  });
});
