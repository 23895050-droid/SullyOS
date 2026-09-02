// 我们的功能数据备份面板（2026-09-03 她定稿的第一件事）——全量/分功能共用的一个组件
// 每个功能的导入导出入口都挂它，只是 scope 不同；与原版备份完全独立、互不影响。
// 走法：点导出 → 一个格式化 JSON 文件直接下载；点导入 → 选文件 → 看备份信息确认 → 导入 → 逐项报告。
import React, { useRef, useState } from 'react';
import {
  exportOurData, downloadOurBackup, importOurData, readOurBackupFile,
  OUR_FEATURE_SCOPES, type OurFeatureId, type OurBackupPayload, type OurImportReport,
} from '../../utils/ourDataBackup';

type Status =
  | { kind: 'idle' }
  | { kind: 'exporting' }
  | { kind: 'exported'; payload: OurBackupPayload; sizeMb: number }
  | { kind: 'picked'; payload: OurBackupPayload; fileName: string }
  | { kind: 'importing' }
  | { kind: 'imported'; report: OurImportReport; payload: OurBackupPayload }
  | { kind: 'error'; message: string };

const scopeLabel = (id: OurFeatureId | 'all'): string =>
  id === 'all' ? '全部功能' : OUR_FEATURE_SCOPES.find((s) => s.id === id)?.label ?? id;

const fmtTime = (iso: string): string => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** 备份文件里装了什么，一行说完 */
const summaryLine = (p: OurBackupPayload): string =>
  `${Object.keys(p.localStorage).length} 个数据区、${p.imageReceipts.length} 条近期接收、${Object.keys(p.blobs).length} 张图`;

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
      const payload = await exportOurData(scope);
      downloadOurBackup(payload);
      setStatus({ kind: 'exported', payload, sizeMb: JSON.stringify(payload, null, 2).length / 1024 / 1024 });
    } catch {
      setStatus({ kind: 'error', message: '导出失败，请重试' });
    }
  };

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const payload = await readOurBackupFile(f);
      setStatus({ kind: 'picked', payload, fileName: f.name });
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : '文件读不了' });
    }
  };

  const doImport = async () => {
    if (status.kind !== 'picked') return;
    const { payload } = status;
    setStatus({ kind: 'importing' });
    try {
      const report = await importOurData(payload);
      setStatus({ kind: 'imported', report, payload });
    } catch {
      setStatus({ kind: 'error', message: '导入失败，请重试' });
    }
  };

  const missingNote = (payload: OurBackupPayload) =>
    payload.missingBlobs?.length
      ? ` ⚠️ 备份里有 ${payload.missingBlobs.length} 个编号在柜子里已找不到原图（字段照样导入，只是那张图会是裂的）。`
      : '';

  return (
    <div className="flex flex-col gap-2">
      <div style={muted}>
        {scope === 'all'
          ? '把我们的功能（相机/相册/近期接收/NoxHome/小助手/音乐）数据打成一个 JSON 文件下载；导入把数据原样写回。与原版备份完全独立、互不影响。'
          : `把「${scopeLabel(scope)}」的数据打成一个 JSON 文件下载；导入把数据原样写回。与原版备份完全独立、互不影响。`}
      </div>

      <div className="flex items-center gap-2">
        <button type="button" style={accentBtn} disabled={status.kind === 'exporting'} onClick={doExport}>
          {status.kind === 'exporting' ? '导出中…' : scope === 'all' ? '导出全部数据' : `导出${scopeLabel(scope)}数据`}
        </button>
        <button type="button" style={softBtn} disabled={status.kind === 'importing'} onClick={() => fileRef.current?.click()}>
          {status.kind === 'importing' ? '导入中…' : '导入备份'}
        </button>
        <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={onPickFile} />
      </div>

      {status.kind === 'exported' && (
        <div style={muted}>
          ✅ 已下载备份（{scopeLabel(status.payload.scope)}，{summaryLine(status.payload)}，文件约 {status.sizeMb.toFixed(1)} MB）。{missingNote(status.payload)}
        </div>
      )}

      {status.kind === 'picked' && (
        <div className="flex flex-col gap-2 rounded-xl px-3 py-2.5" style={{ background: '#fff5f9' }}>
          <div style={{ fontSize: 11, color: '#3a2a33', lineHeight: 1.6 }}>
            「{status.fileName}」：{fmtTime(status.payload.exportedAt)} 导出，范围 {scopeLabel(status.payload.scope)}，含 {summaryLine(status.payload)}。{missingNote(status.payload)}
          </div>
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

      {status.kind === 'error' && (
        <div style={{ fontSize: 11, color: '#c25a82', lineHeight: 1.6 }}>❌ {status.message}</div>
      )}
    </div>
  );
};

export default DataBackupPanel;
