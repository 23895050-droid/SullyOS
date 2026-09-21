// 读书模块 · 后台任务的状态胶囊（2026-09-16，她点名要的「全局悬浮」）
//
// 挂 ReaderApp 上，书房任何一页都看得见（阅读页 / 书架 / 面板都盖在上面）：
//   跑着 → 转圈 + 「阿一正在读这一页…」
//   完了 → ✓ / ✕ + 结果（留 5 秒自己消失）
// 她 09-16 的原话：「总结中，成功失败都要有一个状态胶囊，全局悬浮」。

import { useEffect, useState } from 'react';
import { CheckCircle, WarningCircle } from '@phosphor-icons/react';
import { visibleJobs, useReaderJobs } from './readerJobs';

export default function ReaderJobPill() {
    const store = useReaderJobs();
    const [now, setNow] = useState(() => Date.now());
    const jobs = visibleJobs(store.jobs, now);

    // 只有「刚跑完、还没到消失时间」的胶囊需要自己走秒；跑着的那种不用 tick
    const hasFinished = jobs.some((j) => j.state !== 'running');
    useEffect(() => {
        if (!hasFinished) return;
        const t = window.setInterval(() => setNow(Date.now()), 500);
        return () => window.clearInterval(t);
    }, [hasFinished]);

    if (jobs.length === 0) return null;

    return (
        <div className="rd-jobpill" aria-live="polite">
            {jobs.map((j) => (
                <div key={j.id} className={`rd-jobpill-item rd-jobpill-${j.state}`}>
                    {j.state === 'running'
                        ? <span className="rd-jobpill-spin" aria-hidden />
                        : j.state === 'ok'
                            ? <CheckCircle size={15} weight="fill" className="rd-jobpill-ico" />
                            : <WarningCircle size={15} weight="fill" className="rd-jobpill-ico" />}
                    <span className="rd-jobpill-text">{j.message}</span>
                </div>
            ))}
        </div>
    );
}
