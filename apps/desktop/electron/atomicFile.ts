import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

/** Replace a saved file only after its complete replacement has reached disk. */
export async function writeFileAtomically(filePath: string, data: Uint8Array | string) {
  const directory = path.dirname(filePath);
  await fs.mkdir(directory, { recursive: true });
  const temporaryPath = path.join(directory, `.officewrite-${randomUUID()}.tmp`);
  let temporaryExists = false;
  try {
    const handle = await fs.open(temporaryPath, 'wx');
    temporaryExists = true;
    try {
      await handle.writeFile(data);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(temporaryPath, filePath);
    temporaryExists = false;
  } finally {
    if (temporaryExists) await fs.unlink(temporaryPath).catch(() => undefined);
  }
}
