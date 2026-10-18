import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { IMDF_FILES, validateImdf } from '@indoorkit/imdf';
import { generateVenue, SAKURA_HOSPITAL } from './index';

const outDir = resolve(process.argv[2] ?? 'out/sakura-hospital');
const archive = generateVenue(SAKURA_HOSPITAL);
const result = validateImdf(archive);
if (!result.ok) {
  console.error(result.issues.slice(0, 10));
  throw new Error('generated venue failed IMDF validation');
}

await mkdir(outDir, { recursive: true });
for (const file of IMDF_FILES) {
  const content = archive[file];
  if (content) await writeFile(join(outDir, `${file}.json`), JSON.stringify(content));
}
console.log(
  `wrote ${archive.unit.features.length} units on ${archive.level.features.length} levels to ${outDir}`,
);
