export interface TranscriptSegmentGroup<T> {
  speakerId: string | null;
  segments: T[];
}

export function groupTranscriptSegments<
  T extends { text?: string | null; speaker_id?: string | null },
>(
  segments: T[],
  diarizationEnabled: boolean,
): TranscriptSegmentGroup<T>[] {
  const groups: TranscriptSegmentGroup<T>[] = [];

  for (const segment of segments) {
    if (!segment.text?.trim()) continue;
    const speakerId =
      diarizationEnabled && segment.speaker_id && segment.speaker_id !== "?"
        ? String(segment.speaker_id)
        : null;
    const lastGroup = groups[groups.length - 1];

    if (lastGroup?.speakerId === speakerId) {
      lastGroup.segments.push(segment);
    } else {
      groups.push({ speakerId, segments: [segment] });
    }
  }

  return groups;
}
