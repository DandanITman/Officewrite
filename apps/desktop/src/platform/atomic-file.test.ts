import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeFileAtomically } from '../../electron/atomicFile';

describe('native atomic document saves', () => {
  let directory: string;
  beforeEach(async () => { directory = await fs.mkdtemp(path.join(os.tmpdir(), 'officewrite-atomic-')); });
  afterEach(async () => {
    vi.restoreAllMocks();
    if (!path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep)) throw new Error('Invalid test directory');
    await fs.rm(directory, { recursive: true, force: true });
  });

  it('replaces a document with exactly the selected bytes and removes the staging file', async () => {
    const target = path.join(directory, 'document.officewrite');
    await fs.writeFile(target, 'original document');
    const backing = new Uint8Array([99, 1, 2, 3, 99]);
    await writeFileAtomically(target, backing.subarray(1, 4));
    expect([...await fs.readFile(target)]).toEqual([1, 2, 3]);
    expect(await fs.readdir(directory)).toEqual(['document.officewrite']);
  });

  it('preserves the last saved document after a partially completed write fails', async () => {
    const target = path.join(directory, 'document.officewrite');
    await fs.writeFile(target, 'original document');
    const open = fs.open.bind(fs);
    vi.spyOn(fs, 'open').mockImplementationOnce(async (...args) => {
      const handle = await open(...args);
      const write = handle.writeFile.bind(handle);
      vi.spyOn(handle, 'writeFile').mockImplementationOnce(async () => {
        await write('partially written content');
        throw new Error('disk full');
      });
      return handle;
    });
    await expect(writeFileAtomically(target, 'replacement document')).rejects.toThrow('disk full');
    expect(await fs.readFile(target, 'utf8')).toBe('original document');
    expect(await fs.readdir(directory)).toEqual(['document.officewrite']);
  });

  it('preserves the original if replacement is denied by another application', async () => {
    const target = path.join(directory, 'document.officewrite');
    await fs.writeFile(target, 'original document');
    vi.spyOn(fs, 'rename').mockRejectedValueOnce(new Error('file is locked'));
    await expect(writeFileAtomically(target, 'replacement document')).rejects.toThrow('file is locked');
    expect(await fs.readFile(target, 'utf8')).toBe('original document');
    expect(await fs.readdir(directory)).toEqual(['document.officewrite']);
  });
});
