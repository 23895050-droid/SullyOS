// 读书模块 · 后台任务的状态（2026-09-16）
//
// 她 09-16 定的两条：
//   ① 「总结也好，角色读书也好，都要支持后台进行，不要我一退出去那边就中断了」
//   ② 「总结中，成功失败都要有一个状态胶囊，全局悬浮」
//
// 分工：**活儿本身**是普通 Promise（fetch + 落库），JS 不会因为组件卸载就停——面板收起、
// 退回书架、切到别的 tab 都照跑；这里存的是「它现在到哪一步了」，给胶囊读。
// 任务状态放 localStorage（不是组件 state），所以卸了组件也还在。
//
// 页面被杀（关掉 PWA / 手机杀后台）时留下的 running，下次进书房一律标成「中断」——
// 别让胶囊永远转圈装忙。

import { createCoupleStore, isoNow } from '../couple/coupleStoreBase';

export type ReaderJobKind = 'read' | 'summary' | 'reply';
export type ReaderJobState = 'running' | 'ok' | 'error';

export interface ReaderJob {
    id: string;
    kind: ReaderJobKind;
    /** 是哪个角色在动（胶囊上写「阿一正在读这一页…」） */
    charName: string;
    bookTitle: string;
    state: ReaderJobState;
    /** 一行说明：跑的时候写「正在…」，完了写结果/错因 */
    message: string;
    startedAt: string;
    endedAt?: string;
}

interface JobStore {
    version: number;
    updatedAt: string;
    jobs: ReaderJob[];
}

/** 最多留几条（老的自动丢） */
const MAX_JOBS = 6;
/** 跑完的胶囊在屏幕上多留一会儿（她要看「成功/失败」） */
export const JOB_LINGER_MS = 5000;

const DEFAULT_STORE: JobStore = { version: 1, updatedAt: '1970-01-01T00:00:00.000Z', jobs: [] };

const store = createCoupleStore<JobStore>('reader_jobs_v1', 1, DEFAULT_STORE, (parsed) => ({
    ...DEFAULT_STORE,
    ...parsed,
    jobs: (parsed.jobs ?? []).map((j) => (
        j.state === 'running'
            ? { ...j, state: 'error' as ReaderJobState, message: '上次没跑完（页面关了）', endedAt: isoNow() }
            : j
    )),
}));

export const useReaderJobs = store.use;
export const getReaderJobs = (): ReaderJob[] => store.get().jobs;

const jobId = (): string => `jb_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** 开一个任务（返回 id，结束时要交给 endJob）。 */
export function beginJob(init: {
    kind: ReaderJobKind;
    charName: string;
    bookTitle: string;
    message: string;
}): string {
    const id = jobId();
    const job: ReaderJob = { id, ...init, state: 'running', startedAt: isoNow() };
    store.set((prev) => ({ ...prev, jobs: [...prev.jobs, job].slice(-MAX_JOBS), updatedAt: isoNow() }));
    return id;
}

/** 收任务：成功/失败 + 一句说明（失败把原因写进去，她要看得见）。 */
export function endJob(id: string, state: 'ok' | 'error', message: string): void {
    store.set((prev) => ({
        ...prev,
        jobs: prev.jobs.map((j) => (j.id === id ? { ...j, state, message, endedAt: isoNow() } : j)),
        updatedAt: isoNow(),
    }));
}

/** 胶囊上该显示的：还在跑的全显示 + 刚跑完的留 JOB_LINGER_MS。 */
export function visibleJobs(jobs: ReaderJob[], now = Date.now()): ReaderJob[] {
    return jobs.filter((j) => (
        j.state === 'running' || (j.endedAt ? now - Date.parse(j.endedAt) < JOB_LINGER_MS : false)
    ));
}
