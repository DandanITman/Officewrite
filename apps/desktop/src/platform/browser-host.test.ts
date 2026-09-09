import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

describe('production browser storage failures', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete (window as unknown as Record<string, unknown>).showSaveFilePicker;
  });

  async function setup(failWrite = false) {
    const files = new Map<string, Uint8Array>([['original.txt', new TextEncoder().encode('keep me')]]);
    const dir = {
      getFileHandle: vi.fn(async (name: string, options?: { create?: boolean }) => {
        if (!options?.create && !files.has(name)) throw new Error('missing');
        return {
          getFile: async () => ({ arrayBuffer: async () => files.get(name)!.buffer }),
          createWritable: async () => ({
            write: async (data: ArrayBuffer) => {
              if (failWrite) throw new Error('quota exceeded');
              files.set(name, new Uint8Array(data));
            },
            close: async () => {},
          }),
        };
      }),
      removeEntry: vi.fn(async (name: string) => { files.delete(name); }),
    };
    vi.stubGlobal('navigator', { storage: { getDirectory: async () => ({ getDirectoryHandle: async () => dir }) } });
    const { createBrowserHost } = await import('./browser-host');
    return { host: createBrowserHost(), files, dir };
  }

  it('does not delete the original when a rename write fails', async () => {
    const { host, files, dir } = await setup(true);
    expect(await host.renameFile('/Documents/original.txt', 'renamed.txt')).toBeNull();
    expect(files.has('original.txt')).toBe(true);
    expect(dir.removeEntry).not.toHaveBeenCalled();
  });

  it('does not report a successful copy when storage is full', async () => {
    const { host } = await setup(true);
    expect(await host.copyFile('/Documents/original.txt')).toBeNull();
  });

  it('reports disk write failure on every retry while keeping the browser backup', async () => {
    const { host, files } = await setup();
    const createWritable = vi.fn().mockRejectedValue(new Error('permission revoked'));
    (window as unknown as Record<string, unknown>).showSaveFilePicker = async () => ({ name: 'disk.txt', createWritable });
    expect(await host.saveFile('disk.txt')).toBe('/Documents/disk.txt');
    expect(await host.writeFile('/Documents/disk.txt', 'saved backup')).toBe(false);
    expect(await host.writeFile('/Documents/disk.txt', 'retry backup')).toBe(false);
    expect(new TextDecoder().decode(files.get('disk.txt'))).toBe('retry backup');
    expect(createWritable).toHaveBeenCalledTimes(2);
  });

  it('waits for the same storage initialization during concurrent reads', async () => {
    const { host } = await setup();
    const results = await Promise.all([
      host.readTextFile('/Documents/original.txt'),
      host.readTextFile('/Documents/original.txt'),
    ]);
    expect(results).toEqual(['keep me', 'keep me']);
  });

  it('reports revision quota errors instead of inventing a saved revision', async () => {
    const { host } = await setup();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    await expect(host.saveRevision('/Documents/original.txt', {}, 'Manual save')).rejects.toThrow('Could not save version history');
  });
});
