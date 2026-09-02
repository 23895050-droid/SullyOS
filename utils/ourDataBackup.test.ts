// 我们的数据备份引擎测试（2026-09-03 建；2026-09-04 zip v2 重写）
import { describe, it, expect, vi, beforeEach } from 'vitest';
import JSZip from 'jszip';
import {
  OUR_FEATURE_SCOPES, OUR_BACKUP_FORMAT, OUR_BACKUP_FORMAT_VERSION,
  scopeLocalStorageKeys, scopeIncludesReceipts, collectBlobTokens,
  exportOurData, importOurData, surveyOurData, surveyAllLocalStorage,
  readOurBackupFile, isOurBackupPayload,
  type OurBackupPayload, type OurBackupPayloadV1, type OurBackupBundle,
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
  blobIndex: [],
});

const baseV1 = (): OurBackupPayloadV1 => ({
  format: OUR_BACKUP_FORMAT,
  formatVersion: 1,
  exportedAt: '2026-09-03T00:00:00.000Z',
  scope: 'all',
  localStorage: {},
  imageReceipts: [],
  blobs: {},
});

const bundleOf = (payload: OurBackupPayload | OurBackupPayloadV1, getBlob: OurBackupBundle['getBlob']): OurBackupBundle =>
  ({ payload, getBlob });

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

describe('exportOurData (zip v2)', () => {
  it('分功能导出只收自己的 key，原文件直放 zip 且不重编码', async () => {
    localStorage.setItem('couple_music_v1', JSON.stringify({ chatBgImage: 'blobref:b_abc' }));
    localStorage.setItem('assistant_v1', JSON.stringify({ ref: 'blobref:b_def' }));
    localStorage.setItem('os_image_gen_settings', JSON.stringify({ model: 'x' }));
    blobRefMocks.getBlobForRef.mockResolvedValue(new Blob(['IMG'], { type: 'image/png' }));

    const { payload, zipBlob } = await exportOurData('music');

    expect(payload.scope).toBe('music');
    expect(Object.keys(payload.localStorage)).toEqual(['couple_music_v1']);
    expect(payload.imageReceipts).toEqual([]);
    expect(payload.blobIndex).toEqual([{ id: 'b_abc', type: 'image/png', size: 3 }]);
    expect(payload.missingBlobs).toBeUndefined();
    expect(payload.missingKeys).toHaveLength(scopeLocalStorageKeys('music').length - 1);
    expect(blobRefMocks.getBlobForRef).toHaveBeenCalledTimes(1);
    expect(blobRefMocks.getBlobForRef).toHaveBeenCalledWith('blobref:b_abc');

    const zip = await JSZip.loadAsync(await zipBlob.arrayBuffer());
    expect(zip.file('backup.json')).toBeTruthy();
    const blobsEntry = zip.file('blobs/b_abc');
    expect(blobsEntry).toBeTruthy();
    // 原文件字节直放：STORE 不压缩（zip 压缩方法=0），内容原样
    expect((await blobsEntry!.async('uint8array'))[0]).toBe('I'.charCodeAt(0));
    const json = JSON.parse(await zip.file('backup.json')!.async('string'));
    expect(json.formatVersion).toBe(OUR_BACKUP_FORMAT_VERSION);
    expect(json.blobIndex).toEqual([{ id: 'b_abc', type: 'image/png', size: 3 }]);
  });

  it('全量导出收全部 key + 近期接收表，编号连表一起扫', async () => {
    for (const k of scopeLocalStorageKeys('all')) localStorage.setItem(k, '{}');
    localStorage.setItem('assistant_v1', JSON.stringify({ ref: 'blobref:b_def' }));
    vi.mocked(DB.getAllImageReceipts).mockResolvedValue([receiptRow('img_r1')]);
    blobRefMocks.getBlobForRef.mockResolvedValue(new Blob(['img']));

    const { payload } = await exportOurData('all');

    expect(Object.keys(payload.localStorage)).toEqual(scopeLocalStorageKeys('all'));
    expect(payload.imageReceipts).toEqual([receiptRow('img_r1')]);
    expect(payload.blobIndex.map((b) => b.id).sort()).toEqual(['b_def', 'img_r1']);
    expect(payload.missingKeys).toEqual([]);
  });

  it('柜子里找不到的编号记进 missingBlobs，不中断导出', async () => {
    localStorage.setItem('couple_music_v1', JSON.stringify({ chatBgImage: 'blobref:b_gone' }));
    blobRefMocks.getBlobForRef.mockResolvedValue(null);

    const { payload } = await exportOurData('music');

    expect(payload.blobIndex).toEqual([]);
    expect(payload.missingBlobs).toEqual(['b_gone']);
  });
});

describe('readOurBackupFile', () => {
  it('zip 读回来：backup.json 原样 + 按编号取原文件（mime 保留）', async () => {
    localStorage.setItem('couple_music_v1', JSON.stringify({ chatBgImage: 'blobref:b_abc' }));
    blobRefMocks.getBlobForRef.mockResolvedValue(new Blob(['IMG'], { type: 'image/png' }));
    const { zipBlob } = await exportOurData('music');

    const bundle = await readOurBackupFile(zipBlob);

    expect(bundle.payload.scope).toBe('music');
    expect(Object.keys(bundle.payload.localStorage)).toEqual(['couple_music_v1']);
    const blob = await bundle.getBlob('b_abc');
    expect(blob).toBeTruthy();
    expect(blob!.type).toBe('image/png');
    expect(await bundle.getBlob('nope')).toBeNull();
  });

  it('旧版 v1 JSON 也读，原文件从内嵌 base64 解', async () => {
    const v1 = baseV1();
    v1.localStorage = { assistant_v1: '{}' };
    v1.blobs = { t1: 'data:image/png;base64,AA==' };
    blobRefMocks.dataUrlToBlob.mockReturnValue(new Blob(['x'], { type: 'image/png' }));

    const bundle = await readOurBackupFile(new File([JSON.stringify(v1)], 'b.json', { type: 'application/json' }));

    expect(bundle.payload.formatVersion).toBe(1);
    const blob = await bundle.getBlob('t1');
    expect(blob).toBeTruthy();
    expect(blobRefMocks.dataUrlToBlob).toHaveBeenCalledWith('data:image/png;base64,AA==');
  });

  it('坏 zip / 没有 backup.json / 坏 JSON / 格式不对都直接抛错', async () => {
    await expect(readOurBackupFile(new Blob(['not a zip'], { type: 'application/zip' }))).rejects.toThrow('不是合法的 JSON');
    const badZip = await new JSZip().file('x.txt', 'x').generateAsync({ type: 'blob' });
    await expect(readOurBackupFile(badZip)).rejects.toThrow('没有 backup.json');
    const wrongVersion = { ...basePayload(), formatVersion: 99 };
    const wrongZip = await new JSZip().file('backup.json', JSON.stringify(wrongVersion)).generateAsync({ type: 'blob' });
    await expect(readOurBackupFile(wrongZip)).rejects.toThrow('格式或版本');
  });

  it('isOurBackupPayload 各种坏形态都拒', () => {
    expect(isOurBackupPayload(null)).toBe(false);
    expect(isOurBackupPayload({})).toBe(false);
    expect(isOurBackupPayload({ ...basePayload(), format: 'other' })).toBe(false);
    expect(isOurBackupPayload({ ...basePayload(), scope: 'nope' })).toBe(false);
    expect(isOurBackupPayload({ ...basePayload(), localStorage: { a: 1 } })).toBe(false);
    expect(isOurBackupPayload({ ...basePayload(), imageReceipts: 'no' })).toBe(false);
    expect(isOurBackupPayload(basePayload())).toBe(true);
    expect(isOurBackupPayload(baseV1())).toBe(true);
  });
});

describe('importOurData', () => {
  it('往返：导出 → 读回 → 导入，数据/近期接收/原文件全部还原，mime 不变', async () => {
    localStorage.setItem('couple_todos_v3', JSON.stringify({ todos: [{ id: 't1', text: '买菜' }] }));
    localStorage.setItem('couple_music_v1', JSON.stringify({ chatBgImage: 'blobref:b_abc' }));
    vi.mocked(DB.getAllImageReceipts).mockResolvedValue([receiptRow('img_r1')]);
    blobRefMocks.getBlobForRef.mockImplementation(async (ref: string) =>
      ref === 'blobref:img_r1' ? new Blob(['BIG'], { type: 'image/png' }) : new Blob(['IMG'], { type: 'image/webp' }));
    const { zipBlob } = await exportOurData('all');

    // 模拟目标设备：柜子全空
    localStorage.clear();
    blobRefMocks.getBlobForRef.mockResolvedValue(null);
    const captured: Array<{ token: string; blob: Blob }> = [];
    blobRefMocks.restoreBlobRef.mockImplementation(async (token: string, blob: Blob) => { captured.push({ token, blob }); });

    const bundle = await readOurBackupFile(zipBlob);
    const report = await importOurData(bundle);

    expect(report.localStorageWritten).toBe(2);
    expect(localStorage.getItem('couple_todos_v3')).toContain('买菜');
    expect(report.receiptsWritten).toBe(1);
    expect(DB.saveImageReceipt).toHaveBeenCalledWith(receiptRow('img_r1'));
    expect(report.blobsRestored).toBe(2);
    expect(captured.map((c) => c.token).sort()).toEqual(['blobref:b_abc', 'blobref:img_r1']);
    const big = captured.find((c) => c.token === 'blobref:img_r1')!;
    expect(big.blob.type).toBe('image/png');
    expect(big.blob.size).toBe(3);
  });

  it('localStorage 逐 key 写，配额失败只记该 key 不中断', async () => {
    const realSetItem = localStorage.setItem.bind(localStorage);
    const setSpy = vi.spyOn(localStorage, 'setItem').mockImplementation((key: string, value: string) => {
      if (key === 'fail_me') throw new Error('quota');
      realSetItem(key, value);
    });
    const payload = basePayload();
    payload.localStorage = { good_a: 'val_a', fail_me: 'val_b' };

    const report = await importOurData(bundleOf(payload, async () => null));

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

    const report = await importOurData(bundleOf(payload, async () => null));

    expect(report.receiptsWritten).toBe(1);
    expect(report.receiptsFailed).toEqual(['img_bad']);
  });

  it('blob 已存在跳过、缺失按原编号放回柜子；备份里没有原文件的记失败', async () => {
    blobRefMocks.getBlobForRef.mockImplementation((ref: string) =>
      Promise.resolve(ref === 'blobref:t_keep' ? new Blob(['k']) : null));
    const payload = basePayload();
    payload.blobIndex = [
      { id: 't_keep', type: 'image/png', size: 1 },
      { id: 't_new', type: 'image/png', size: 1 },
      { id: 't_noop', type: 'image/png', size: 1 },
    ];
    const getBlob = vi.fn(async (id: string) =>
      id === 't_new' ? new Blob(['x']) : null);

    const report = await importOurData(bundleOf(payload, getBlob));

    expect(report.blobsSkipped).toBe(1);
    expect(report.blobsRestored).toBe(1);
    expect(report.blobsFailed).toEqual(['t_noop']);
    expect(blobRefMocks.restoreBlobRef).toHaveBeenCalledWith('blobref:t_new', expect.any(Blob));
  });

  it('导入收尾广播刷新事件（store 现场重读，不用刷新页面）', async () => {
    // node 环境没有 window：临时用 EventTarget 顶上去，观察引擎广播
    const g = globalThis as Record<string, unknown>;
    const hadWindow = g.window;
    const stub = new EventTarget();
    g.window = stub;
    const heard: string[] = [];
    const onEvent = (e: Event) => heard.push(e.type);
    stub.addEventListener('our-backup-imported', onEvent);
    stub.addEventListener('couple-beauty-changed', onEvent);
    try {
      await importOurData(bundleOf(basePayload(), async () => null));
    } finally {
      stub.removeEventListener('our-backup-imported', onEvent);
      stub.removeEventListener('couple-beauty-changed', onEvent);
      if (hadWindow === undefined) delete g.window;
      else g.window = hadWindow;
    }
    expect(heard).toContain('our-backup-imported');
    expect(heard).toContain('couple-beauty-changed');
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

describe('surveyAllLocalStorage', () => {
  it('列全部 key（含清单外的），大的在前，known 标记对', () => {
    localStorage.setItem('couple_todos_v3', 'x'.repeat(10));
    localStorage.setItem('upstream_key_whatever', 'y'.repeat(50));

    const survey = surveyAllLocalStorage();

    expect(survey.keys).toEqual([
      { key: 'upstream_key_whatever', bytes: 50, known: false },
      { key: 'couple_todos_v3', bytes: 10, known: true },
    ]);
    expect(survey.totalBytes).toBe(60);
  });
});
