import { describe, expect, it } from "vitest";
import { ObsidianHttpTransport } from "../src/infrastructure/obsidian-http-transport";
import { setRequestUrlMock } from "./obsidian-mock";

describe("ObsidianHttpTransport", () => {
  it("does not access the JSON getter for a binary response", async () => {
    const binary = new Uint8Array([0, 1, 2, 255]).buffer;
    setRequestUrlMock(async () => ({
      status: 200,
      headers: { "content-type": "image/png" },
      arrayBuffer: binary,
      get json(): never {
        throw new SyntaxError("JSON Parse error: Unrecognized token");
      },
      text: "",
    }));
    const response = await new ObsidianHttpTransport().request({
      url: "https://download.example/image.png",
      responseType: "binary",
    });
    expect([...new Uint8Array(response.arrayBuffer)]).toEqual([0, 1, 2, 255]);
    expect(response.json).toBeUndefined();
  });
});
