// 读书模块 · 导入认领卡（2026-09-21，她验收 T6 时提的）
//
// 她的原话：「导入导出的数据没办法精准匹配给某个角色，所以我希望导入后匹配不上角色的，
// 可以弹出来一个引导卡片，手动把那个角色的数据找回给已有的角色」。
//
// 起因：角色 id 是**那台设备上生成的**（`char_demo` 这种），换台设备导进来对不上号，
// 那批批注/活动记录就没了主人。所以包里带一份 `ownerNames`（当时叫什么名字），
// 导入前先把「这台设备没有的人」列出来，她在这里一个一个认领给现有的角色。
//
// 认领只影响**这次导入怎么写**（一份老 id → 新 id 的表，交给 `applyReaderImport`），
// 不动包里的东西；没认领的那部分**不写**（宁可少几条，也不造幽灵角色）。

import { useState } from 'react';
import { UserPlus } from '@phosphor-icons/react';
import { planImport, type ReaderExportBundle, type ImportOwnerStat } from '../../utils/reader/readerExport';

interface Props {
    bundle: ReaderExportBundle;
    /** 这台设备上现有的角色（可以认领给谁） */
    characters: Array<{ id: string; name: string }>;
    /** 默认认给谁（从某个角色的设置页导入时，默认就是他自己） */
    defaultTo?: string;
    busy?: boolean;
    onCancel: () => void;
    onConfirm: (remap: Record<string, string>) => void;
}

const line = (s: ImportOwnerStat): string => [
    s.annotations ? `${s.annotations} 条批注` : '',
    s.threads ? `${s.threads} 条讨论话` : '',
    s.progress ? `${s.progress} 条进度` : '',
    s.roam ? `${s.roam} 条活动记录` : '',
    s.hasSettings ? '他自己的设置' : '',
].filter(Boolean).join(' · ') || '（这份里没带他的东西）';

export default function ImportMapSheet({ bundle, characters, defaultTo, busy, onCancel, onConfirm }: Props) {
    const unknown = planImport(bundle, characters.map((c) => c.id)).filter((s) => !s.known);
    /** 认领表：包里的老 id → 这台设备上的谁（'' = 先不导他的）。**默认全都不导**，
     *  要哪个人她自己点——默认值上宁可少写，也不要悄悄挂到某个人名下。 */
    const [picked, setPicked] = useState<Record<string, string>>(
        () => Object.fromEntries(unknown.map((s) => [s.id, ''])),
    );

    const choose = (id: string, to: string) => setPicked((prev) => ({ ...prev, [id]: to }));
    const chosenCount = unknown.filter((s) => picked[s.id]).length;

    return (
        <div className="rd-sheet-mask" onClick={onCancel}>
            <div className="rd-sheet rd-sheet-tall" onClick={(e) => e.stopPropagation()}>
                <div className="rd-sheet-grip" />
                <div className="rd-sheet-title">这份数据里的人，这台设备上找不到</div>
                <div className="rd-muted" style={{ marginBottom: 'var(--rd-space-4)' }}>
                    导出的文件里，每个人是用那台设备上的编号记的，换台设备就对不上号。
                    认一下他是谁，这批东西就归到那个人名下；不认的那部分这次不导进来（文件本身不动）。
                </div>

                <div className="rd-sheet-body" style={{ overflowY: 'auto' }}>
                    {unknown.map((s) => (
                        <div className="rd-card" key={s.id} style={{ marginBottom: 'var(--rd-space-4)' }}>
                            <div className="rd-row">
                                <span className="rd-row-label">{s.name}</span>
                                <span className="rd-item-value">{picked[s.id] ? '已认领' : '还没认'}</span>
                            </div>
                            <div className="rd-muted" style={{ margin: '2px 0 var(--rd-space-3)' }}>{line(s)}</div>
                            <div className="rd-chips rd-chips-wrap">
                                <button
                                    className={`rd-chip${picked[s.id] === '' ? ' rd-chip-on' : ''}`}
                                    onClick={() => choose(s.id, '')}
                                >
                                    先不导他的
                                </button>
                                {characters.map((c) => (
                                    <button
                                        key={c.id}
                                        className={`rd-chip${picked[s.id] === c.id ? ' rd-chip-on' : ''}`}
                                        onClick={() => choose(s.id, c.id)}
                                    >
                                        {c.name}
                                    </button>
                                ))}
                            </div>
                            {defaultTo && (
                                <button
                                    className="rd-btn rd-btn-soft"
                                    style={{ marginTop: 'var(--rd-space-3)' }}
                                    onClick={() => choose(s.id, defaultTo)}
                                >
                                    <UserPlus size={14} /> 就当是他
                                </button>
                            )}
                        </div>
                    ))}
                </div>

                <div className="rd-btn-row" style={{ marginTop: 'var(--rd-space-4)' }}>
                    <button
                        className="rd-btn rd-btn-primary"
                        disabled={busy}
                        onClick={() => onConfirm(Object.fromEntries(Object.entries(picked).filter(([, v]) => v)))}
                    >
                        {busy ? '正在导…' : chosenCount > 0 ? `认好了，导进来（${chosenCount} 位）` : '一个都不认，只导能认出来的'}
                    </button>
                    <button className="rd-btn" onClick={onCancel} disabled={busy}>取消</button>
                </div>
            </div>
        </div>
    );
}
