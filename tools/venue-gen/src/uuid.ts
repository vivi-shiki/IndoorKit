/** FNV-1a，生成与 seed 绑定的稳定 UUID */
function hash32(text: string, salt: number): number {
  let h = 0x811c9dc5 ^ salt;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function makeUuid(seed: string, key: string): string {
  const hex = [0, 1, 2, 3]
    .map((salt) => hash32(`${seed}/${key}`, salt).toString(16).padStart(8, '0'))
    .join('');
  const chars = hex.split('');
  chars[12] = '4';
  chars[16] = '89ab'[Number.parseInt(chars[16]!, 16) % 4]!;
  const s = chars.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}
