import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { departmentExtension } from '@indoorkit/hospital';
import { type AnyImdfExtension, IMDF_FILES, type ImdfArchive, validateImdf } from '@indoorkit/imdf';
import { parkingExtensions } from '@indoorkit/parking';
import { generateParking, generateVenue, MINATO_PARKING, SAKURA_HOSPITAL } from './index';

/** 两个虚构场馆写到 <outDir>/<场馆>/<文件>.json */
const outDir = resolve(process.argv[2] ?? 'out');

async function write(name: string, archive: ImdfArchive, extensions: readonly AnyImdfExtension[]) {
  const result = validateImdf(archive, extensions);
  if (!result.ok) {
    console.error(result.issues.slice(0, 10));
    throw new Error(`generated venue ${name} failed IMDF validation`);
  }
  const dir = join(outDir, name);
  await mkdir(dir, { recursive: true });
  for (const file of [...IMDF_FILES, ...extensions.map((e) => e.file)]) {
    const content = archive[file];
    if (content) await writeFile(join(dir, `${file}.json`), JSON.stringify(content));
  }
  console.log(
    `wrote ${archive.unit.features.length} units on ${archive.level.features.length} levels to ${dir}`,
  );
}

await write('sakura-hospital', generateVenue(SAKURA_HOSPITAL), [departmentExtension]);
await write('minato-parking', generateParking(MINATO_PARKING), parkingExtensions);
