// 读书模块 · 设置页「数据导入导出」（2026-09-21，T6 ③）
//
// 她 09-21 定的第三条：**范围勾选（文本 / 笔记 / 媒体 / 书内容）、支持分角色**。
// 这一页就是那个入口（角色自己的那一份导出在他的设置页里）。
//
// 导出的是一份 JSON（`sullyos-reader-export`）：
//   · 书内容 = 书目 + 正文（不含原始 epub/txt 文件本身，正文已经在库里）
//   · 笔记   = 批注 + 讨论 + 进度
//   · 文本   = 活动记录（感受、摘要都在里面）
//   · 媒体   = 封面图
//   · 设置   = 读书偏好 / 每个角色自己的设置与阅读风格 / 提示词套 / 挂载规则
//
// 导入是按 id 覆盖：同一份包导两遍不会翻倍；换设备导进来是把新行加进去。

import { useMemo, useRef, useState } from 'react';
import { ArrowLeft, DownloadSimple, UploadSimple } from '@phosphor-icons/react';
import { useOS } from '../../../context/OSContext';
import {
    FULL_EXPORT_SCOPE, applyReaderImport, buildReaderExport, downloadReaderBundle, isReaderBundle,
    planImport, type ReaderExportBundle, type ReaderExportScope,
} from '../../../utils/reader/readerExport';
import ImportMapSheet from '../ImportMapSheet';

const SCOPE_LABELS: Array<{ key: keyof ReaderExportScope; label: string; hint: string }> = [
    { key: 'content', label: '书内容', hint: '书目 + 正文（不含原始 epub/txt 文件）' },
    { key: 'notes', label: '笔记', hint: '批注 + 讨论 + 进度' },
    { key: 'text', label: '文本', hint: '活动记录、感受、摘要' },
    { key: 'media', label: '媒体', hint: '封面图（会大一点）' },
    { key: 'settings', label: '设置', hint: '读书偏好 / 角色设置与风格 / 提示词套 / 挂载规则' },
];

interface Props {
    onBack: () => void;
    notify: (msg: string) => void;
}

export default function ReaderSetData({ onBack, notify }: Props) {
    const { characters, userProfile } = useOS();
    const [scope, setScope] = useState<ReaderExportScope>({ ...FULL_EXPORT_SCOPE });
    const [owners, setOwners] = useState<string[]>([]);
    const [busy, setBusy] = useState(false);
    /** 认不出人的包先停在这儿，等她在认领卡里认完再写库 */
    const [pending, setPending] = useState<ReaderExportBundle | null>(null);
    const fileRef = useRef<HTMLInputElement | null>(null);

    const charIds = useMemo(() => characters.map((c) => c.id), [characters]);
    /** 包里带名字：换设备导入时那张认领卡才知道「他是谁」 */
    const nameMap = useMemo(
        () => ({ user: userProfile?.name ?? '我', ...Object.fromEntries(characters.map((c) => [c.id, c.name])) }),
        [characters, userProfile],
    );

    const toggle = (key: keyof ReaderExportScope) => setScope((s) => ({ ...s, [key]: !s[key] }));
    const toggleOwner = (id: string) => setOwners((arr) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]));

    const doExport = async () => {
        if (!Object.values(scope).some(Boolean)) { notify('一样都没勾，没东西可导'); return; }
        setBusy(true);
        try {
            const bundle = await buildReaderExport({ scope, owners, ownerNames: nameMap });
            const who = owners.length === 0 ? '' : characters.filter((c) => owners.includes(c.id)).map((c) => c.name).join('+');
            const name = downloadReaderBundle(bundle, who || undefined);
            notify(`导出好了：${name}`);
        } catch (e) {
            notify(`导出没成：${e instanceof Error ? e.message : '未知错误'}`);
        }
        setBusy(false);
    };

    /** 真写库（认领表可以是空的 = 只导能认出来的） */
    const runImport = async (bundle: ReaderExportBundle, remap: Record<string, string>) => {
        setBusy(true);
        try {
            const r = await applyReaderImport(bundle, { remap, knownCharIds: charIds });
            const bits = [
                r.books ? `${r.books} 本书` : '',
                r.chapters ? `${r.chapters} 章正文` : '',
                r.annotations ? `${r.annotations} 条批注` : '',
                r.threads ? `${r.threads} 个讨论` : '',
                r.progress ? `${r.progress} 条进度` : '',
                r.roam ? `${r.roam} 条活动记录` : '',
                r.blobs ? `${r.blobs} 张图` : '',
                r.settings ? '设置' : '',
                r.skipped ? `${r.skipped} 条没认领、没导` : '',
            ].filter(Boolean);
            notify(bits.length > 0 ? `导进来了：${bits.join(' · ')}` : '文件是空的，什么都没导');
        } catch (e) {
            notify(`导入没成：${e instanceof Error ? e.message : '文件读不出来'}`);
        }
        setBusy(false);
    };

    const doImport = async (file: File) => {
        setBusy(true);
        try {
            const data: unknown = JSON.parse(await file.text());
            if (!isReaderBundle(data)) throw new Error('这不是书房导出的文件');
            // 认不出人的包先弹认领卡（她 09-21 要的：「匹配不上角色的，手动找回给已有的角色」）
            const unknown = planImport(data, charIds).filter((s) => !s.known);
            setBusy(false);
            if (unknown.length > 0) { setPending(data); return; }
            await runImport(data, {});
        } catch (e) {
            notify(`导入没成：${e instanceof Error ? e.message : '文件读不出来'}`);
            setBusy(false);
        }
    };

    return (
        <div className="rd-screen" data-rd-page="settings-data">
            <div className="rd-headbar">
                <button className="rd-back" onClick={onBack}><ArrowLeft size={18} />设置</button>
                <div className="rd-headbar-title">数据导入导出</div>
            </div>

            <div className="rd-section-title">导出什么</div>
            <div className="rd-card">
                <div className="rd-chips rd-chips-wrap">
                    {SCOPE_LABELS.map((s) => (
                        <button key={s.key} className={`rd-chip${scope[s.key] ? ' rd-chip-on' : ''}`} onClick={() => toggle(s.key)}>
                            {s.label}
                        </button>
                    ))}
                </div>
                <div className="rd-hint-list">
                    {SCOPE_LABELS.filter((s) => scope[s.key]).map((s) => (
                        <div className="rd-muted" key={s.key}>{s.label} = {s.hint}</div>
                    ))}
                    {SCOPE_LABELS.every((s) => !scope[s.key]) && <div className="rd-muted">一样都没勾。</div>}
                </div>
            </div>

            <div className="rd-section-title">导出谁</div>
            <div className="rd-card">
                <div className="rd-chips rd-chips-wrap">
                    <button className={`rd-chip${owners.length === 0 ? ' rd-chip-on' : ''}`} onClick={() => setOwners([])}>
                        全部
                    </button>
                    {characters.map((c) => (
                        <button
                            key={c.id}
                            className={`rd-chip${owners.includes(c.id) ? ' rd-chip-on' : ''}`}
                            onClick={() => toggleOwner(c.id)}
                        >
                            {c.name}
                        </button>
                    ))}
                </div>
                <div className="rd-muted" style={{ marginTop: 'var(--rd-space-3)' }}>
                    挑了几个角色，就只导他们留下的痕迹（批注 / 讨论 / 进度 / 活动记录）；
                    书内容与封面跟着他们碰过的书走。
                </div>
                <div className="rd-muted">不挑就是全部。</div>
            </div>

            <div className="rd-btn-row" style={{ marginTop: 'var(--rd-space-4)' }}>
                <button className="rd-btn rd-btn-primary" onClick={() => void doExport()} disabled={busy}>
                    <DownloadSimple size={15} /> 导出成文件
                </button>
                <button className="rd-btn" onClick={() => fileRef.current?.click()} disabled={busy}>
                    <UploadSimple size={15} /> 从文件导入
                </button>
            </div>
            <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                style={{ display: 'none' }}
                onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) void doImport(f);
                }}
            />

            {pending && (
                <ImportMapSheet
                    bundle={pending}
                    characters={characters}
                    busy={busy}
                    onCancel={() => setPending(null)}
                    onConfirm={(remap) => { const b = pending; setPending(null); if (b) void runImport(b, remap); }}
                />
            )}

            <div className="rd-hint-list" style={{ marginTop: 'var(--rd-space-4)' }}>
                <div className="rd-muted">
                    {busy ? '正在读写…' : '导入是按 id 覆盖：同一份包导两遍不会翻倍，换设备导进来是把新行加进去。'}
                </div>
                <div className="rd-muted">角色自己那一份（他的笔记 + 他的设置）在他的设置页里，不用在这儿挑角色。</div>
                <div className="rd-muted">导出的文件是一份 JSON，存在你手机的下载里。</div>
            </div>
        </div>
    );
}
