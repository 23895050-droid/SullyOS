// 我们的数据备份引擎测试（2026-09-03）
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  OUR_FEATURE_SCOPES, OUR_BACKUP_FORMAT, OUR_BACKUP_FORMAT_VERSION,
  scopeLocalStorageKeys, scopeIncludesReceipts, collectBlobTokens,
  exportOurData, importOurData, surveyOurData, readOurBackupFile, isOurBackupPayload,
  type OurBackupPayload,
} from './ourDataBackup';
import type { ImageReceipt } from '../types';

vi.mock('./db', () => ({
  DB: {
    getAllImageReceipts: vi.fn(async () => [] as ImageReceipt[]),
    saveImageReceipt: vi.fn(async () => {}),
  },
}));

const blobRefMocks = vi.hoisted(() => ({
  getBlobForRef: vi.fn<(ref: string) => Promise<Blob | null>>(),
  restoreBlobRef: vi.fn<(token: string, blob: Blob) => Promise<void>>(),
  blobToDataUrl: vi.fn<(blob: Blob) => Promise<string>>(),
  dataUrlToBlob: vi.fn<(dataUrl: string) => Blob>(),
}));

vi.mock('./blobRef', () => blobRefMocks);

import { DB } from './db';

const receiptRow = (id: string): ImageReceipt => ({
  id, blobRef: `blobref:${id}`, charId: 'nox', description: '测试图', timestamp: 1, mimeType: 'image/png', isSelfie: false,
});

const basePayload = (): OurBackupPayload => ({
  format: OUR_BACKUP_FORMAT,
  formatVersion: OUR_BACKUP_FORMAT_VERSION,
  exportedAt: '2026-09-03T00:00:00.000Z',
  scope: 'all',
  localStorage: {},
  imageReceipts: [],
  blobs: {},
});

beforeEach(() => {
  localStorage.clear();
  vi.resetAllMocks();
  vi.mocked(DB.getAllImageReceipts).mockResolvedValue([]);
  vi.mocked(DB.saveImageReceipt).mockResolvedValue(undefined);
});

describe('功能面清单', () => {
  it('全量 = 所有功能的 key 并集去重，音乐只算一次', () => {
    const keys = scopeLocalStorageKeys('all');
    const expectCount = new Set(OUR_FEATURE_SCOPES.flatMap((s) => s.localStorageKeys)).size;
    expect(keys).toHaveLength(expectCount);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.filter((k) => k === 'couple_music_v1')).toHaveLength(1);
  });

  it('分功能只给各自的 key；近期接收无 key 只有表', () => {
    expect(scopeLocalStorageKeys('music')).toEqual(['couple_music_v1']);
    expect(scopeLocalStorageKeys('receipts')).toEqual([]);
    expect(scopeIncludesReceipts('receipts')).toBe(true);
    expect(scopeIncludesReceipts('all')).toBe(true);
    expect(scopeIncludesReceipts('music')).toBe(false);
  });
});

describe('collectBlobTokens', () => {
  it('扫出全部编号并去重，非编号文本不误伤', () => {
    const tokens = collectBlobTokens([
      '{"a":"blobref:b_1","b":"blobref:b_2"}',
      'blobref:b_1 again blobref:img_9 data:image/png;base64,xx',
    ]);
    expect([...tokens].sort()).toEqual(['b_1', 'b_2', 'img_9']);
  });
});

describe('exportOurData', () => {
  it('分功能导出只收自己的 key，编号只扫自己的数据', async () => {
    localStorage.setItem('couple_music_v1', JSON.stringify({ chatBgImage: 'blobref:b_abc' }));
    localStorage.setItem('assistant_v1', JSON.stringify({ ref: 'blobref:b_def' }));
    localStorage.setItem('os_image_gen_settings', JSON.stringify({ model: 'x' }));
    blobRefMocks.getBlobForRef.mockResolvedValue(new Blob(['img']));
    blobRefMocks.blobToDataUrl.mockResolvedValue('data:image/png;base64,AAA');

    const payload = await exportOurData('music');

    expect(payload.scope).toBe('music');
    expect(Object.keys(payload.localStorage)).toEqual(['couple_music_v1']);
    expect(payload.imageReceipts).toEqual([]);
    expect(payload.blobs).toEqual({ b_abc: 'data:image/png;base64,AAA' });
    expect(payload.missingBlobs).toBeUndefined();
    expect(blobRefMocks.getBlobForRef).toHaveBeenCalledTimes(1);
    expect(blobRefMocks.getBlobForRef).toHaveBeenCalledWith('blobref:b_abc');
    expect(payload.format).toBe(OUR_BACKUP_FORMAT);
    expect(payload.formatVersion).toBe(OUR_BACKUP_FORMAT_VERSION);
    expect(payload.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('全量导出收全部 key + 近期接收表，编号连表一起扫', async () => {
    for (const k of scopeLocalStorageKeys('all')) localStorage.setItem(k, '{}');
    localStorage.setItem('assistant_v1', JSON.stringify({ ref: 'blobref:b_def' }));
    vi.mocked(DB.getAllImageReceipts).mockResolvedValue([receiptRow('img_r1')]);
    blobRefMocks.getBlobForRef.mockResolvedValue(new Blob(['img']));
    blobRefMocks.blobToDataUrl.mockImplementation(async () => 'data:image/png;base64,Z');

    const payload = await exportOurData('all');

    expect(Object.keys(payload.localStorage)).toEqual(scopeLocalStorageKeys('all'));
    expect(payload.imageReceipts).toEqual([receiptRow('img_r1')]);
    expect(Object.keys(payload.blobs).sort()).toEqual(['b_def', 'img_r1']);
  });

  it('柜子里找不到的编号记进 missingBlobs，不中断导出', async () => {
    localStorage.setItem('couple_music_v1', JSON.stringify({ chatBgImage: 'blobref:b_gone' }));
    blobRefMocks.getBlobForRef.mockResolvedValue(null);

    const payload = await exportOurData('music');

    expect(payload.blobs).toEqual({});
    expect(payload.missingBlobs).toEqual(['b_gone']);
  });
});

describe('surveyOurData', () => {
  it('有的列大小（大的在前）、没有的列 missing，总量 = 各 key 之和', async () => {
    localStorage.setItem('couple_beauty_v1', 'x'.repeat(30));
    localStorage.setItem('assistant_v1', 'y'.repeat(5));

    const survey = await surveyOurData('all');

    expect(survey.keys).toEqual([
      { key: 'couple_beauty_v1', bytes: 30 },
      { key: 'assistant_v1', bytes: 5 },
    ]);
    expect(survey.totalBytes).toBe(35);
    expect(survey.missingKeys).toHaveLength(scopeLocalStorageKeys('all').length - 2);
    expect(survey.receiptsCount).toBe(0);
  });

  it('近期接收条数跟范围走', async () => {
    vi.mocked(DB.getAllImageReceipts).mockResolvedValue([receiptRow('img_r1'), receiptRow('img_r2')]);

    expect((await surveyOurData('receipts')).receiptsCount).toBe(2);
    expect((await surveyOurData('music')).receiptsCount).toBe(0);
  });
});

describe('importOurData', () => {
  it('localStorage 逐 key 写，配额失败只记该 key 不中断', async () => {
    const realSetItem = localStorage.setItem.bind(localStorage);
    const setSpy = vi.spyOn(localStorage, 'setItem').mockImplementation((key: string, value: string) => {
      if (key === 'fail_me') throw new Error('quota');
      realSetItem(key, value);
    });
    const payload = basePayload();
    payload.localStorage = { good_a: 'val_a', fail_me: 'val_b' };

    const report = await importOurData(payload);

    expect(report.localStorageWritten).toBe(1);
    expect(report.localStorageFailed).toEqual(['fail_me']);
    setSpy.mockRestore();
    expect(localStorage.getItem('good_a')).toBe('val_a');
    expect(localStorage.getItem('fail_me')).toBeNull();
  });

  it('近期接收按 id 写回；写失败记 id', async () => {
    vi.mocked(DB.saveImageReceipt).mockImplementation(async (r: ImageReceipt) => {
      if (r.id === 'img_bad') throw new Error('write failed');
    });
    const payload = basePayload();
    payload.imageReceipts = [receiptRow('img_ok'), receiptRow('img_bad')];

    const report = await importOurData(payload);

    expect(report.receiptsWritten).toBe(1);
    expect(report.receiptsFailed).toEqual(['img_bad']);
    expect(DB.saveImageReceipt).toHaveBeenCalledTimes(2);
  });

  it('blob 已存在跳过、缺失按原编号放回柜子', async () => {
    blobRefMocks.getBlobForRef.mockImplementation((ref: string) =>
      Promise.resolve(ref === 'blobref:t_keep' ? new Blob(['k']) : null));
    blobRefMocks.dataUrlToBlob.mockReturnValue(new Blob(['x']));
    const payload = basePayload();
    payload.blobs = { t_keep: 'data:image/png;base64,keep', t_new: 'data:image/png;base64,new' };

    const report = await importOurData(payload);

    expect(report.blobsSkipped).toBe(1);
    expect(report.blobsRestored).toBe(1);
    expect(blobRefMocks.restoreBlobRef).toHaveBeenCalledTimes(1);
    expect(blobRefMocks.restoreBlobRef).toHaveBeenCalledWith('blobref:t_new', expect.any(Blob));
    expect(blobRefMocks.dataUrlToBlob).toHaveBeenCalledWith('data:image/png;base64,new');
  });

  it('blob 还原失败记编号，不中断其余', async () => {
    blobRefMocks.getBlobForRef.mockResolvedValue(null);
    blobRefMocks.dataUrlToBlob.mockReturnValue(new Blob(['x']));
    blobRefMocks.restoreBlobRef.mockImplementation(async (token: string) => {
      if (token === 'blobref:t_bad') throw new Error('restore failed');
    });
    const payload = basePayload();
    payload.blobs = { t_bad: 'data:image/png;base64,b', t_good: 'data:image/png;base64,g' };

    const report = await importOurData(payload);

    expect(report.blobsRestored).toBe(1);
    expect(report.blobsFailed).toEqual(['t_bad']);
  });
});

describe('readOurBackupFile / isOurBackupPayload', () => {
  it('合法文件读回来原样', async () => {
    const payload = basePayload();
    payload.localStorage = { assistant_v1: '{}' };
    const file = new File([JSON.stringify(payload)], 'b.json', { type: 'application/json' });

    expect(await readOurBackupFile(file)).toEqual(payload);
  });

  it('坏 JSON / 格式不对 / 版本不对都直接抛错', async () => {
    await expect(readOurBackupFile(new File(['not json'], 'b.json'))).rejects.toThrow('不是合法的 JSON');
    await expect(readOurBackupFile(new File(['{"a":1}'], 'b.json'))).rejects.toThrow('格式或版本');
    const wrongVersion = { ...basePayload(), formatVersion: 2 };
    await expect(readOurBackupFile(new File([JSON.stringify(wrongVersion)], 'b.json'))).rejects.toThrow('格式或版本');
  });

  it('isOurBackupPayload 各种坏形态都拒', () => {
    expect(isOurBackupPayload(null)).toBe(false);
    expect(isOurBackupPayload({})).toBe(false);
    expect(isOurBackupPayload({ ...basePayload(), format: 'other' })).toBe(false);
    expect(isOurBackupPayload({ ...basePayload(), scope: 'nope' })).toBe(false);
    expect(isOurBackupPayload({ ...basePayload(), localStorage: { a: 1 } })).toBe(false);
    expect(isOurBackupPayload({ ...basePayload(), imageReceipts: 'no' })).toBe(false);
    expect(isOurBackupPayload(basePayload())).toBe(true);
  });
});
