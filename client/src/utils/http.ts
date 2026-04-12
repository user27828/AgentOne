type ErrorBody = {
  error?: string;
  detail?: string;
};

const getErrorMessage = (status: number, data: unknown): string => {
  if (typeof data === "string" && data.trim()) {
    return data;
  }

  if (data && typeof data === "object") {
    const body = data as ErrorBody;

    if (typeof body.error === "string" && body.error.trim()) {
      return body.error;
    }

    if (typeof body.detail === "string" && body.detail.trim()) {
      return body.detail;
    }
  }

  return `Request failed with status ${status}`;
};

const parseResponseBody = async (response: Response): Promise<unknown> => {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json().catch(() => null);
  }

  const text = await response.text().catch(() => "");
  return text || null;
};

export class HttpError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, data: unknown) {
    super(getErrorMessage(status, data));
    this.name = "HttpError";
    this.status = status;
    this.data = data;
  }
}

export const isHttpError = (error: unknown): error is HttpError =>
  error instanceof HttpError;

export const fetchJson = async <T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> => {
  const response = await fetch(input, init);
  const data = await parseResponseBody(response);

  if (!response.ok) {
    throw new HttpError(response.status, data);
  }

  return data as T;
};

export const fetchBlob = async (
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Blob> => {
  const response = await fetch(input, init);

  if (!response.ok) {
    const data = await parseResponseBody(response);
    throw new HttpError(response.status, data);
  }

  return response.blob();
};
