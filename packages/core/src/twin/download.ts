/**
 * 下载并报告进度。Content-Length 只用来估算进度：CDN 压缩传输时它是压缩后的大小，
 * 比解压后读到的字节少，所以按块收集，不按它预分配。
 */
export async function download(url: string, signal: AbortSignal, onProgress: (p: number) => void) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`3D model: HTTP ${response.status}`);
  const total = Number(response.headers.get('content-length')) || 0;
  if (!response.body || total === 0) return response.arrayBuffer();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress(Math.min(0.99, received / total));
  }
  const out = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  onProgress(1);
  return out.buffer;
}
