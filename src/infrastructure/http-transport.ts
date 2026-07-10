export interface HttpRequest {
  url: string;
  method?: string;
  responseType?: "json" | "binary";
  contentType?: string;
  body?: string | ArrayBuffer;
  headers?: Record<string, string>;
}

export interface HttpResponse {
  status: number;
  headers: Readonly<Record<string, string>>;
  arrayBuffer: ArrayBuffer;
  json: unknown;
  text: string;
}

export interface HttpTransport {
  request(request: HttpRequest): Promise<HttpResponse>;
}
