import { requestUrl } from "obsidian";
import type { HttpRequest, HttpResponse, HttpTransport } from "./http-transport";

export class ObsidianHttpTransport implements HttpTransport {
  async request(request: HttpRequest): Promise<HttpResponse> {
    const response = await requestUrl({ ...request, throw: false });
    return {
      status: response.status,
      headers: response.headers,
      arrayBuffer: response.arrayBuffer,
      json: response.json as unknown,
      text: response.text,
    };
  }
}
