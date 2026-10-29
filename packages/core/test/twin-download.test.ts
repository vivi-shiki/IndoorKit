import { describe, expect, it, vi } from 'vitest';
import { download } from '../src/twin/download';

const respond = (bytes: Uint8Array, headers: Record<string, string>, chunk = 3) => {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += chunk) controller.enqueue(bytes.slice(i, i + chunk));
      controller.close();
    },
  });
  vi.stubGlobal('fetch', async () => new Response(body, { headers }));
};

describe('model download with progress', () => {
  const bytes = Uint8Array.from({ length: 20 }, (_, i) => i);

  it('returns every byte and reports progress up to 1', async () => {
    respond(bytes, { 'content-length': '20' });
    const progress: number[] = [];
    const out = await download('x', new AbortController().signal, (p) => progress.push(p));
    expect([...new Uint8Array(out)]).toEqual([...bytes]);
    expect(progress.at(-1)).toBe(1);
  });

  it('keeps every byte when the server compresses and Content-Length is the compressed size', async () => {
    // GitHub Pages 等 CDN 压缩后，Content-Length 比解压后的字节数小
    respond(bytes, { 'content-length': '8', 'content-encoding': 'gzip' });
    const out = await download('x', new AbortController().signal, () => {});
    expect([...new Uint8Array(out)]).toEqual([...bytes]);
  });
});
