import type { AnalyzePlayerResponse } from "@/types";

export class FunctionApiError extends Error {
  status: number;
  code: string | null;
  payload: unknown;

  constructor(message: string, status: number, code: string | null, payload: unknown) {
    super(message);
    this.name = "FunctionApiError";
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

const toJson = (text: string) => {
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
};

export const resolveFunctionsBaseUrl = () => {
  const explicit = (import.meta.env.PUBLIC_FUNCTIONS_BASE_URL as string | undefined)?.trim();
  if (explicit) {
    return explicit.replace(/\/+$/, "");
  }

  const supabaseUrl = (import.meta.env.PUBLIC_SUPABASE_URL as string | undefined)?.trim();
  if (!supabaseUrl) {
    throw new Error(
      "Supabase public env vars are missing. Configure PUBLIC_FUNCTIONS_BASE_URL or PUBLIC_SUPABASE_URL."
    );
  }

  const match = supabaseUrl.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co$/i);
  if (!match) {
    throw new Error(
      "PUBLIC_SUPABASE_URL format is invalid. Expected https://<project-ref>.supabase.co."
    );
  }

  return `https://${match[1]}.functions.supabase.co`;
};

const postFunctionJson = async <T>(name: string, body: unknown): Promise<T> => {
  const baseUrl = resolveFunctionsBaseUrl();
  const response = await fetch(`${baseUrl}/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const text = await response.text();
  const payload = toJson(text);

  if (!response.ok) {
    const payloadObject = payload && typeof payload === "object" ? payload : {};
    const payloadMessage =
      payloadObject && "error" in payloadObject && typeof payloadObject.error === "string"
        ? payloadObject.error
        : `Function ${name} failed with status ${response.status}`;
    const payloadCode =
      payloadObject && "code" in payloadObject && typeof payloadObject.code === "string"
        ? payloadObject.code
        : null;

    throw new FunctionApiError(payloadMessage, response.status, payloadCode, payload ?? text);
  }

  return (payload ?? ({} as T)) as T;
};

export const postFunctionForDiagnostics = async (name: string, body: unknown) => {
  const baseUrl = resolveFunctionsBaseUrl();
  const startedAt = new Date().toISOString();
  const response = await fetch(`${baseUrl}/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const text = await response.text();
  const payload = toJson(text);
  const finishedAt = new Date().toISOString();

  return {
    endpoint: `${baseUrl}/${name}`,
    startedAt,
    finishedAt,
    status: response.status,
    ok: response.ok,
    payload: payload ?? text
  };
};

interface AnalyzePlayerInput {
  tag: string;
  lang?: "fr" | "en";
}

export const analyzePlayer = async (input: AnalyzePlayerInput): Promise<AnalyzePlayerResponse> => {
  return postFunctionJson<AnalyzePlayerResponse>("analyze-player", input);
};

interface ProContactInput {
  player_tag: string;
  email?: string;
  discord?: string;
  message?: string;
  language?: "fr" | "en";
  consent_contact: boolean;
  website?: string;
}

export const submitProContact = async (input: ProContactInput) => {
  return postFunctionJson<{ ok: boolean }>("pro-contact", input);
};
