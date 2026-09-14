// 读书模块 · 导入 Worker（2026-09-14）
//
// 只干重活：解压 / 解码 / 抽段 / 切章。不碰 IndexedDB、不碰 React、不碰 blob——
// 落库全部归主线程（importClient），DB 与 GC 记账只有一个出口。
//
// 加载方式照 utils/memoryPalace/vectorSearch.ts:79 的范式：
//   new Worker(new URL('./importWorker.ts', import.meta.url), { type: 'module' })
// （vite 原生支持；环境不支持 module worker 时由 importClient 降级到主线程直跑。）

import { parseTxt } from './importTxt';
import { parseEpub } from './importEpub';
import type { ImportedPayload } from './importTxt';

export interface ImportWorkerRequest {
    file: Blob;
    fileName: string;
    format: 'epub' | 'txt';
    forcedEncoding?: string;
}

export interface ImportWorkerReply {
    ok: boolean;
    payload?: ImportedPayload;
    error?: string;
}

const ctx = self as unknown as {
    onmessage: ((ev: MessageEvent<ImportWorkerRequest>) => void) | null;
    postMessage: (msg: ImportWorkerReply) => void;
};

ctx.onmessage = async (ev) => {
    const req = ev.data;
    try {
        if (req.format === 'epub') {
            const payload = await parseEpub(req.file, { fileName: req.fileName });
            if ('error' in payload) ctx.postMessage({ ok: false, error: payload.error });
            else ctx.postMessage({ ok: true, payload });
            return;
        }
        const bytes = new Uint8Array(await req.file.arrayBuffer());
        const payload = parseTxt(bytes, { fileName: req.fileName, forcedEncoding: req.forcedEncoding });
        if ('error' in payload) ctx.postMessage({ ok: false, error: payload.error });
        else ctx.postMessage({ ok: true, payload });
    } catch (e) {
        ctx.postMessage({ ok: false, error: `导入失败：${(e as Error).message || '未知错误'}` });
    }
};
