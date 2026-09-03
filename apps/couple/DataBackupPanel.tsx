// 我们的功能数据备份面板（2026-09-03 她定稿的第一件事）——全量/分功能共用的一个组件
// 每个功能的导入导出入口都挂它，只是 scope 不同；与原版备份完全独立、互不影响。
// 走法：点导出 → 一个格式化 JSON 文件直接下载；点导入 → 选文件 → 看备份信息确认 → 导入 → 逐项报告。
import React, { useRef, useState } from 'react';
import {
  exportOurData, downloadOurBackup, importOurData, surveyOurData, surveyAllLocalStorage, readOurBackupFile, collectBlobTokens,
  OUR_FEATURE_SCOPES, type OurFeatureId, type OurBackupPayload, type OurBackupPayloadV1, type OurBackupPayloadAny,
  type OurBackupBundle, type OurImportReport, type OurDataSurvey, type OurDataRawSurvey,
} from '../../utils/ourDataBackup';

type Status =
  | { kind: 'idle' }
  | { kind: 'exporting' }
  | { kind: 'exported'; payload: OurBackupPayload; zipBlob: Blob; sizeMb: number }
  | { kind: 'picked'; bundle: OurBackupBundle; fileName: string }
  | { kind: 'importing' }
  | { kind: 'imported'; report: OurImportReport; payload: OurBackupPayloadAny }
  | { kind: 'surveyed'; survey: OurDataSurvey; raw?: OurDataRawSurvey }
  | { kind: 'error'; message: string };

const scopeLabel = (id: OurFeatureId | 'all'): string =>
  id === 'all' ? '全部功能' : OUR_FEATURE_SCOPES.find((s) => s.id === id)?.label ?? id;

const fmtSize = (bytes: number): string =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

// key → 功能名（盘点列表里把技术名翻成人话）
const KEY_SCOPE_LABEL: Record<string, string> = {};
for (const s of OUR_FEATURE_SCOPES) for (const k of s.localStorageKeys) KEY_SCOPE_LABEL[k] = s.label;

const fmtTime = (iso: string): string => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** 备份文件里装了什么，一行说完 */
const blobCount = (p: OurBackupPayloadAny): number =>
  'blobIndex' in p && p.formatVersion === 2 ? p.blobIndex.length : Object.keys((p as OurBackupPayloadV1).blobs ?? {}).length;

const summaryLine = (p: OurBackupPayloadAny): string =>
  `${Object.keys(p.localStorage).length} 个数据区、${p.imageReceipts.length} 条近期接收、${blobCount(p)} 个文件`;

const fromLabel = (keys: string[]): string =>
  keys.length === 0 ? '未知来源' : keys.map((k) => (k === 'image_receipts' ? '近期接收' : KEY_SCOPE_LABEL[k] ?? k)).join('、');

/** 备份里谁占了大头：文字部分多大 + 最大的 3 个文件各自多大、被谁引用（一眼看出大文件是谁） */
const backupDetail = (p: OurBackupPayloadAny): string => {
  const lsBytes = Object.values(p.localStorage).reduce((s, v) => s + new Blob([v]).size, 0);
  const sources = new Map<string, string[]>();
  for (const [key, v] of Object.entries(p.localStorage)) {
    for (const t of collectBlobTokens([v])) {
      const arr = sources.get(t) ?? [];
      if (!arr.includes(key)) arr.push(key);
      sources.set(t, arr);
    }
  }
  for (const r of p.imageReceipts) {
    const t = r.blobRef.replace('blobref:', '');
    const arr = sources.get(t) ?? [];
    if (!arr.includes('image_receipts')) arr.push('image_receipts');
    sources.set(t, arr);
  }
  const entries: Array<{ id: string; bytes: number; from: string[] }> = 'blobIndex' in p && p.formatVersion === 2
    ? p.blobIndex.map((b) => ({ id: b.id, bytes: b.size, from: sources.get(b.id) ?? [] }))
    : Object.entries((p as OurBackupPayloadV1).blobs ?? {}).map(([id, dataUrl]) => ({ id, bytes: dataUrl.length, from: sources.get(id) ?? [] }));
  const blobTotal = entries.reduce((s, e) => s + e.bytes, 0);
  const top = entries.sort((a, b) => b.bytes - a.bytes).slice(0, 3).map((x) => `${fromLabel(x.from)}（${fmtSize(x.bytes)}）`);
  return `文字部分 ${fmtSize(lsBytes)}；文件共 ${fmtSize(blobTotal)}，最大：${top.length > 0 ? top.join('、') : '无'}`;
};

/** 这台设备上清单里有但没有的 key（没用过就没有，不是丢数据） */
const missingKeysLine = (p: OurBackupPayloadAny): string => {
  const mk = (p as OurBackupPayload).missingKeys;
  if (!mk || mk.length === 0) return '';
  return `这台设备上没有：${mk.map((k) => KEY_SCOPE_LABEL[k] ?? k).join('、')}（没用过就没有，不是丢数据）`;
};

const DataBackupPanel: React.FC<{ scope: OurFeatureId | 'all' }> = ({ scope }) => {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const fileRef = useRef<HTMLInputElement>(null);

  const muted: React.CSSProperties = { fontSize: 11, color: '#9a7a8a', lineHeight: 1.6 };
  const accentBtn: React.CSSProperties = {
    border: 0, cursor: 'pointer', borderRadius: 999, padding: '9px 16px', fontSize: 12, fontWeight: 700,
    color: '#fff', background: 'var(--cs-accent, #f0a8c0)',
  };
  const softBtn: React.CSSProperties = {
    border: 0, cursor: 'pointer', borderRadius: 999, padding: '9px 16px', fontSize: 12, fontWeight: 600,
    color: 'var(--cs-deep, #c25a82)', background: '#fff5f9',
  };

  const doExport = async () => {
    setStatus({ kind: 'exporting' });
    try {
      const { payload, zipBlob } = await exportOurData(scope);
      void downloadOurBackup(zipBlob, scope);
      setStatus({ kind: 'exported', payload, zipBlob, sizeMb: zipBlob.size / 1024 / 1024 });
    } catch {
      setStatus({ kind: 'error', message: '导出失败，请重试' });
    }
  };

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const bundle = await readOurBackupFile(f);
      setStatus({ kind: 'picked', bundle, fileName: f.name });
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : '文件读不了' });
    }
  };

  const doSurvey = async () => {
    try {
      const survey = await surveyOurData(scope);
      const raw = scope === 'all' ? surveyAllLocalStorage() : undefined;
      setStatus({ kind: 'surveyed', survey, raw });
    } catch {
      setStatus({ kind: 'error', message: '盘点失败，请重试' });
    }
  };

  const doImport = async () => {
    if (status.kind !== 'picked') return;
    const { bundle } = status;
    setStatus({ kind: 'importing' });
    try {
      const report = await importOurData(bundle);
      setStatus({ kind: 'imported', report, payload: bundle.payload });
    } catch {
      setStatus({ kind: 'error', message: '导入失败，请重试' });
    }
  };

  const missingNote = (payload: OurBackupPayloadAny) =>
    payload.missingBlobs?.length
      ? ` ⚠️ 备份里有 ${payload.missingBlobs.length} 个编号在柜子里已找不到原图（字段照样导入，只是那张图会是裂的）。`
      : '';

  return (
    <div className="flex flex-col gap-2">
      <div style={muted}>
        {scope === 'all'
          ? '把我们的功能（相机/相册/近期接收/NoxHome/小助手/音乐）数据打成一个 zip 文件下载（里面是格式化 JSON + 原文件，图片不压缩不转码）；导入把数据原样写回。与原版备份完全独立、互不影响。'
          : `把「${scopeLabel(scope)}」的数据打成一个 zip 文件下载（里面是格式化 JSON + 原文件，图片不压缩不转码）；导入把数据原样写回。与原版备份完全独立、互不影响。`}
      </div>

      <div className="flex items-center gap-2">
        <button type="button" style={accentBtn} disabled={status.kind === 'exporting'} onClick={doExport}>
          {status.kind === 'exporting' ? '导出中…' : scope === 'all' ? '导出全部数据' : `导出${scopeLabel(scope)}数据`}
        </button>
        <button type="button" style={softBtn} disabled={status.kind === 'importing'} onClick={() => fileRef.current?.click()}>
          {status.kind === 'importing' ? '导入中…' : '导入备份'}
        </button>
        <input ref={fileRef} type="file" accept=".zip,.json,application/zip,application/json" className="hidden" onChange={onPickFile} />
        <button type="button" style={{ ...softBtn, color: '#9a7a8a', background: 'transparent', padding: '9px 8px' }} onClick={doSurvey}>
          盘点数据
        </button>
      </div>

      {status.kind === 'exported' && (
        <div className="flex flex-col gap-0.5">
          <div style={muted}>
            ✅ 已下载备份（{scopeLabel(status.payload.scope)}，{summaryLine(status.payload)}，文件约 {status.sizeMb.toFixed(1)} MB）。{missingNote(status.payload)}
          </div>
          <div style={muted}>{backupDetail(status.payload)}</div>
          {missingKeysLine(status.payload) && <div style={muted}>{missingKeysLine(status.payload)}</div>}
        </div>
      )}

      {status.kind === 'picked' && (
        <div className="flex flex-col gap-2 rounded-xl px-3 py-2.5" style={{ background: '#fff5f9' }}>
          <div style={{ fontSize: 11, color: '#3a2a33', lineHeight: 1.6 }}>
            「{status.fileName}」：{fmtTime(status.bundle.payload.exportedAt)} 导出，范围 {scopeLabel(status.bundle.payload.scope)}，含 {summaryLine(status.bundle.payload)}。{missingNote(status.bundle.payload)}
          </div>
          <div style={muted}>{backupDetail(status.bundle.payload)}</div>
          {missingKeysLine(status.bundle.payload) && <div style={muted}>{missingKeysLine(status.bundle.payload)}</div>}
          <div style={muted}>导入会补写并覆盖同名数据（以备份为准），点击确认后开始。</div>
          <div className="flex items-center gap-2">
            <button type="button" style={accentBtn} onClick={doImport}>确认导入</button>
            <button type="button" style={softBtn} onClick={() => setStatus({ kind: 'idle' })}>取消</button>
          </div>
        </div>
      )}

      {status.kind === 'imported' && (
        <div className="flex flex-col gap-1 rounded-xl px-3 py-2.5" style={{ background: '#f2fbf5' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#2f7d54' }}>导入完成 ✅</div>
          <div style={muted}>
            写了 {status.report.localStorageWritten} 个数据区{status.report.receiptsWritten > 0 ? `、近期接收写回 ${status.report.receiptsWritten} 条` : ''}
            {status.report.blobsRestored > 0 || status.report.blobsSkipped > 0
              ? `、图片恢复 ${status.report.blobsRestored} 张${status.report.blobsSkipped > 0 ? `（跳过已存在的 ${status.report.blobsSkipped} 张）` : ''}`
              : ''}
            。去各页面看看数据回来没有。
          </div>
          {status.report.localStorageFailed.length > 0 && (
            <div style={{ ...muted, color: '#c25a82' }}>写失败：{status.report.localStorageFailed.join('、')}</div>
          )}
          {status.report.receiptsFailed.length > 0 && (
            <div style={{ ...muted, color: '#c25a82' }}>近期接收失败：{status.report.receiptsFailed.join('、')}</div>
          )}
          {status.report.blobsFailed.length > 0 && (
            <div style={{ ...muted, color: '#c25a82' }}>图片恢复失败：{status.report.blobsFailed.join('、')}</div>
          )}
          {status.payload.missingBlobs?.length ? <div style={{ ...muted, color: '#c25a82' }}>备份里 {status.payload.missingBlobs.length} 个编号没有原图（见上），对应图是裂的。</div> : null}
        </div>
      )}

      {status.kind === 'surveyed' && (
        <div className="flex flex-col gap-1.5 rounded-xl px-3 py-2.5" style={{ background: '#faf7f8', border: '1px solid #f2d3e0' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#3a2a33' }}>
            这台设备上：数据区 {status.survey.keys.length} 个（共 {fmtSize(status.survey.totalBytes)}）
            {status.survey.receiptsCount > 0 && `、近期接收 ${status.survey.receiptsCount} 条`}
          </div>
          <div style={muted}>当前地址：{window.location.origin}</div>
          {status.survey.keys.length > 0 && (
            <div className="flex flex-col gap-0.5">
              {status.survey.keys.slice(0, 10).map((k) => (
                <div key={k.key} className="flex items-center justify-between" style={{ fontSize: 11, color: '#3a2a33' }}>
                  <span>{KEY_SCOPE_LABEL[k.key] ?? k.key} · {k.key}</span>
                  <span style={{ color: k.bytes > 1024 * 1024 ? '#c25a82' : '#9a7a8a', fontVariantNumeric: 'tabular-nums' }}>{fmtSize(k.bytes)}</span>
                </div>
              ))}
              {status.survey.keys.length > 10 && <div style={muted}>…还有 {status.survey.keys.length - 10} 个小的没列</div>}
            </div>
          )}
          {status.survey.missingKeys.length > 0 && (
            <div style={muted}>
              这台设备上没有：{status.survey.missingKeys.map((k) => KEY_SCOPE_LABEL[k] ?? k).join('、')}
            </div>
          )}
          {status.raw && (
            <div className="flex flex-col gap-0.5" style={{ borderTop: '1px dashed #f2d3e0', paddingTop: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#3a2a33' }}>
                全部存储共 {status.raw.keys.length} 个 key（{fmtSize(status.raw.totalBytes)}），含原版数据，大的在前：
              </div>
              {status.raw.keys.slice(0, 12).map((k) => (
                <div key={k.key} className="flex items-center justify-between" style={{ fontSize: 11, color: '#3a2a33' }}>
                  <span>{k.known ? `${KEY_SCOPE_LABEL[k.key] ?? ''} · ` : '原版 · '}{k.key}</span>
                  <span style={{ color: k.bytes > 1024 * 1024 ? '#c25a82' : '#9a7a8a', fontVariantNumeric: 'tabular-nums' }}>{fmtSize(k.bytes)}</span>
                </div>
              ))}
              {status.raw.keys.length > 12 && <div style={muted}>…还有 {status.raw.keys.length - 12} 个没列</div>}
            </div>
          )}
        </div>
      )}

      {status.kind === 'error' && (
        <div style={{ fontSize: 11, color: '#c25a82', lineHeight: 1.6 }}>❌ {status.message}</div>
      )}
    </div>
  );
};

export default DataBackupPanel;
