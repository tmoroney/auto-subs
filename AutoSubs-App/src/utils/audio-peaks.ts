/**
 * Compute waveform peaks from an audio file entirely in the browser using
 * the Web Audio API. No Rust/ffmpeg needed — decodeAudioData handles any
 * format the browser supports (mp3, aac, wav, ogg, flac, m4a…).
 *
 * Skips files over MAX_BYTES to avoid OOM in the WebView.
 *
 * @param src   The asset URL from convertFileSrc() — what the browser can fetch
 * @param count Number of bars / peaks to return
 */
export async function getAudioPeaks(
  src: string,
  count: number,
): Promise<number[]> {
  count = Math.max(10, Math.min(2000, count));

  // Check Content-Length before fetching the full file
  const headResp = await fetch(src, { method: "HEAD" });
  const contentLength = headResp.headers.get("Content-Length");
  if (contentLength) {
    const bytes = parseInt(contentLength, 10);
    const MAX_BYTES = 100 * 1024 * 1024; // 100 MB
    if (bytes > MAX_BYTES) {
      return [];
    }
  }

  const response = await fetch(src);
  const arrayBuffer = await response.arrayBuffer();

  // OfflineAudioContext: we only need to decode, not play
  const ctx = new OfflineAudioContext(1, 1, 44100);
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

  // Mix down to mono by averaging all channels
  const channelCount = audioBuffer.numberOfChannels;
  const length = audioBuffer.length;
  const mono = new Float32Array(length);
  for (let c = 0; c < channelCount; c++) {
    const data = audioBuffer.getChannelData(c);
    for (let i = 0; i < length; i++) {
      mono[i] += data[i] / channelCount;
    }
  }

  // Bin into `count` peaks, taking max absolute value per bin
  const binSize = Math.floor(length / count);
  const peaks = new Array<number>(count);
  for (let i = 0; i < count; i++) {
    const start = i * binSize;
    const end = i === count - 1 ? length : start + binSize;
    let max = 0;
    for (let j = start; j < end; j++) {
      const v = Math.abs(mono[j]);
      if (v > max) max = v;
    }
    peaks[i] = max;
  }

  // Normalize so loudest bar = 1.0
  const globalMax = Math.max(...peaks);
  if (globalMax > 0) {
    for (let i = 0; i < count; i++) peaks[i] /= globalMax;
  }

  return peaks;
}
