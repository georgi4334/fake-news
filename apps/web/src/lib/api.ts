import type { AnalyzeJsonRequest, AnalyzeResponse, HistoryItem, ProgressEvent, Report } from "@veritas/shared";
import axios, { isAxiosError } from "axios";

export const http = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? "/api" });

export const api = {
  analyze: (body: AnalyzeJsonRequest) => http.post<AnalyzeResponse>("/analyze", body).then((r) => r.data),
  report: (id: string) => http.get<Report>(`/analyses/${id}`).then((r) => r.data),
  history: () => http.get<HistoryItem[]>("/analyses").then((r) => r.data),
  /** Opens the SSE progress stream. Returns a function that closes it. */
  stream(id: string, onEvent: (e: ProgressEvent) => void): () => void {
    const es = new EventSource(`${http.defaults.baseURL}/analyses/${id}/events`);
    es.onmessage = (msg) => {
      const e = JSON.parse(msg.data) as ProgressEvent;
      onEvent(e);
      if (e.type === "done" || e.type === "error") es.close();
    };
    return () => es.close();
  },
};

export function errorMessage(err: unknown): string {
  if (isAxiosError(err)) return err.response?.data?.error ?? err.message;
  return err instanceof Error ? err.message : String(err);
}
