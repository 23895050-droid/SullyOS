// 读书模块 · 提示词名守卫（2026-09-20）
//
// 今天差点踩一个真坑：把「共读·读一页」改名成「共读·读书」之后，调用处
// 还指着老名字——`getPrompt` 找不到就返回**空字符串**，模型会收到一段没有指令的
// 提示词，而且不报错。这条测试就是钉死这件事：代码里出现的每个提示词名，
// 注册表里必须真的有。（不查 localStorage 里的用户改动，只查默认值。）
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { getPromptEntries } from '../promptRegistry';

const ROOT = process.cwd();
const DIRS = [join(ROOT, 'utils', 'reader'), join(ROOT, 'apps', 'reader')];

const walk = (dir: string): string[] => {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) { out.push(...walk(full)); continue; }
        if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.test.ts') && !name.endsWith('.test.tsx')) out.push(full);
    }
    return out;
};

/** 代码里按名字取提示词的两个入口：expand('名', …) 和 getPrompt('名'…) */
const LABEL_CALL = /(?:expand|getPrompt)\(\s*'([^']+)'/g;

describe('读书模块 · 提示词名对得上', () => {
    it('代码里用到的每个提示词名，注册表里都有', () => {
        const known = new Set(getPromptEntries().map((e) => e.label));
        const missing: string[] = [];
        for (const dir of DIRS) {
            for (const file of walk(dir)) {
                const src = readFileSync(file, 'utf-8');
                for (const m of src.matchAll(LABEL_CALL)) {
                    if (!known.has(m[1])) missing.push(`${file.replace(ROOT, '')} → "${m[1]}"`);
                }
            }
        }
        expect(missing, `这些提示词名在注册表里找不到（getPrompt 会返回空串，模型收到空指令）：\n${missing.join('\n')}`).toEqual([]);
    });
});
