export interface YandexEmbeddedResourceList {
  items: YandexResource[];
  limit: number;
  offset: number;
  total: number;
}

export interface YandexResource {
  name: string;
  path: string;
  type: "dir" | "file";
  size?: number;
  modified?: string;
  md5?: string;
  revision?: number | string;
  mime_type?: string;
  _embedded?: YandexEmbeddedResourceList;
}

export interface YandexDiskInfo {
  total_space: number;
  used_space: number;
  user?: {
    login?: string;
    display_name?: string;
  };
}

export interface YandexDownloadLink {
  href: string;
  method: string;
}

export interface YandexTokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

export interface YandexOAuthError {
  error: string;
  error_description?: string;
}
