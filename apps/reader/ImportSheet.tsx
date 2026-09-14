// 读书模块 · 导入卡（2026-09-14）
//
// 选文件 → 解析 → 落库，全程一张卡：进度、失败原因、TXT 编码都在这里选。
// 「换编码重解」（已导入的书发现是乱码）走书架长按菜单——那条路会**新建一本书**，
// 旧书和它的批注原样留着（v3 §5.2：重新导入就是重建一本，不做跨版本迁移）。

import { useRef, useState } from 'react';
import { FileArrowUp, X } from '@phosphor-icons/react';
import { importBookFile, type ImportProgress } from '../../utils/reader/importClient';

export const ENCODING_CHOICES = ['自动识别', 'utf-8', 'gb18030', 'big5', 'shift_jis', 'euc-jp'];

interface Props {
    onClose: () => void;
    onImported: (bookId: string) => void;
    /** 复用同一张卡做「换编码重解」时传原文件 */
    presetFile?: File;
    presetEncoding?: string;
    onBusyChange?: (busy: boolean) => void;
}

export default function ImportSheet({ onClose, onImported, presetFile, presetEncoding, onBusyChange }: Props) {
    const [busy, setBusy] = useState(false);
    const [progress, setProgress] = useState<ImportProgress | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [encoding, setEncoding] = useState(presetEncoding ?? ENCODING_CHOICES[0]);
    const [fileName, setFileName] = useState(presetFile?.name ?? '');
    const fileRef = useRef<HTMLInputElement>(null);
    const abortRef = useRef({ aborted: false });

    const run = async (file: File) => {
        setBusy(true);
        onBusyChange?.(true);
        setError(null);
        setFileName(file.name);
        setProgress({ phase: '解析中', done: 0, total: 1 });
        abortRef.current = { aborted: false };
        const result = await importBookFile(file, {
            forcedEncoding: encoding === ENCODING_CHOICES[0] ? undefined : encoding,
            signal: abortRef.current,
            onProgress: setProgress,
        });
        setBusy(false);
        onBusyChange?.(false);
        if ('error' in result) {
            setError(result.error);
            return;
        }
        onImported(result.bookId);
    };

    const pick = (f: File | undefined) => {
        if (!f) return;
        void run(f);
    };

    return (
        <div className="rd-sheet-mask" onClick={() => { if (!busy) onClose(); }}>
            <div className="rd-sheet" onClick={(e) => e.stopPropagation()}>
                <div className="rd-sheet-grip" />
                <div className="rd-row" style={{ marginBottom: 'var(--rd-space-3)' }}>
                    <div className="rd-sheet-title" style={{ marginBottom: 0 }}>导入书籍</div>
                    <button className="rd-icon-btn" onClick={onClose} disabled={busy} aria-label="关闭"><X size={18} /></button>
                </div>
                <div className="rd-sheet-body">
                    <div className="rd-muted">第一期支持 EPUB 和 TXT。单本建议 5MB 以内，大文件导入会慢一点。</div>

                    <div className="rd-row-label">TXT 编码（EPUB 不用管）</div>
                    <div className="rd-chips" style={{ marginBottom: 0 }}>
                        {ENCODING_CHOICES.map((e) => (
                            <button
                                key={e}
                                className={`rd-chip${encoding === e ? ' rd-chip-on' : ''}`}
                                disabled={busy}
                                onClick={() => setEncoding(e)}
                            >
                                {e}
                            </button>
                        ))}
                    </div>

                    <input
                        ref={fileRef}
                        type="file"
                        accept=".epub,.txt,application/epub+zip,text/plain"
                        style={{ display: 'none' }}
                        onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }}
                    />

                    <button
                        className="rd-btn rd-btn-primary"
                        disabled={busy}
                        onClick={() => fileRef.current?.click()}
                    >
                        <FileArrowUp size={16} style={{ marginRight: 6, verticalAlign: -3 }} />
                        {busy ? '正在导入…' : fileName ? '换一个文件' : '选择文件'}
                    </button>

                    {fileName && <div className="rd-muted">当前文件：{fileName}</div>}

                    {busy && progress && (
                        <div className="rd-muted">
                            {progress.phase}
                            {progress.total > 1 ? ` ${progress.done} / ${progress.total} 章` : ''}
                        </div>
                    )}

                    {busy && (
                        <button className="rd-btn" onClick={() => { abortRef.current.aborted = true; }}>
                            取消
                        </button>
                    )}

                    {error && (
                        <div>
                            <div style={{ fontWeight: 600, marginBottom: 4 }}>导入没成功</div>
                            <div className="rd-muted" style={{ marginBottom: 10 }}>{error}</div>
                            <div className="rd-btn-row">
                                <button className="rd-btn" disabled={busy} onClick={() => fileRef.current?.click()}>
                                    换文件/换编码再来
                                </button>
                                <button className="rd-btn" onClick={onClose}>先算了</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
