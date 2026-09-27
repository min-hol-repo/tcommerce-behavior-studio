import type { DemoEvent, DemoRun, Scenario, StoredEvent } from "../shared/contracts.ts";
import type { Summary } from "../shared/analytics.ts";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: { "content-type": "application/json", ...(options?.headers ?? {}) },
    ...options,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export type BatchStatus = "stored" | "duplicate" | "invalid" | "conflict" | "retryable";
export type BatchResult = { eventId: string; status: BatchStatus; message?: string };

export const api = {
  health: () => request<{ status: string; database: string; asOf: string }>("/api/health"),
  listRuns: () => request<DemoRun[]>("/api/demo-runs"),
  createRun: (input: { scenario: Scenario; targetRate: number }) => request<DemoRun>("/api/demo-runs", { method: "POST", body: JSON.stringify(input) }),
  updateRun: (id: string, input: Partial<Pick<DemoRun, "status" | "scenario" | "targetRate">>) => request<DemoRun>(`/api/demo-runs/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  sendBatch: (events: DemoEvent[]) => request<{ results: BatchResult[] }>("/api/events/batch", { method: "POST", body: JSON.stringify({ events }) }),
  summary: (demoRunId: string, source?: "manual" | "synthetic") => request<Summary>(`/api/analytics/summary?${new URLSearchParams({ demoRunId, ...(source ? { source } : {}) })}`),
  events: (demoRunId: string, source?: "manual" | "synthetic") => request<{ events: StoredEvent[] }>(`/api/events?${new URLSearchParams({ demoRunId, limit: "50", ...(source ? { source } : {}) })}`),
  sessionEvents: (demoRunId: string, sessionId: string) => request<{ events: StoredEvent[] }>(`/api/sessions/${sessionId}/events?${new URLSearchParams({ demoRunId })}`),
};
