import { generateSubtitleDocumentFilename, readSubtitleDocument, saveSubtitleDocument } from "@/utils/file-utils";
import type { QueueTranscript } from "./job-service";

/** Save a queue result without changing the active editor or timeline. */
export async function saveQueueResult(jobId: string, sourcePath: string, transcript: QueueTranscript): Promise<string> {
  if (!jobId || !sourcePath) throw new Error("A queue item and source are required");
  // A fresh ID for each run preserves earlier edits if a job is retried.
  const filename = generateSubtitleDocumentFilename(true, sourcePath);
  const sourceFileName = sourcePath.split(/[/\\]/).pop() || "transcript";
  await saveSubtitleDocument(transcript, filename, {
    metadata: {
      sourceType: "standalone",
      displayName: sourceFileName.replace(/\.[^/.\\]+$/, "") || sourceFileName,
      sourceFilePath: sourcePath,
      sourceFileName,
    },
  });
  return filename;
}

/** The caller must flush pending editor saves before opening this document. */
export function loadQueueResult(filename: string) {
  return readSubtitleDocument(filename);
}
