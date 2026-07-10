import { requestUrl } from "obsidian";
import type { HttpRequest, HttpResponse, HttpTransport } from "./http-transport";

export class ObsidianHttpTransport implements HttpTransport {
  async request(request: HttpRequest): Promise<HttpResponse> {
    const { responseType = "json", ...options } = request;
    const response = await requestUrl({ ...options, throw: false });
    return {
      status: response.status,
      headers: response.headers,
      arrayBuffer: response.arrayBuffer,
      json: responseType === "binary" ? undefined : (response.json as unknown),
      text: responseType === "binary" ? "" : response.text,
    };
  }
}
