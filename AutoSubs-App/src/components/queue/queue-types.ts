import type { TranscriptionOptions } from "@/types";

export type QueueItemStatus =
  | "pending" | "preparing" | "transcribing" | "exporting"
  | "completed" | "failed" | "cancelled" | "interrupted";

/** Presentation data only. The runner owns settings and state transitions. */
export interface QueueItemView {
  id: string;
  sourcePath: string;
  model: string;
  language: string;
  options: TranscriptionOptions;
  status: QueueItemStatus;
  progress?: number;
  error?: string;
  outputPath?: string;
}
