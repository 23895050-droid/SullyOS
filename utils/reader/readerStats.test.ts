import { describe, expect, it } from 'vitest';
import {
    addReading, dayKeyOf, emptyStats, fmtChars, fmtSec, heatLevel, recentKeys, streakDays, sumDays,
} from './readerStats';

describe('readerStats · 阅读流水', () => {
    it('日期键走本地时间（不能用 UTC——半夜读的会被记到前一天）', () => {
        const d = new Date(2026, 8, 15, 0, 30);   // 2026-09-15 00:30 本地
        expect(dayKeyOf(d)).toBe('2026-09-15');
    });

    it('记一笔落在「那一天 + 那一个小时」两个格子里', () => {
        const s0 = emptyStats();
        const s1 = addReading(s0, new Date(2026, 8, 15, 22, 10), { sec: 120, pages: 3, chars: 900 });
        expect(s1.days['2026-09-15']).toEqual({ sec: 120, pages: 3, chars: 900 });
        expect(s1.hours[22]).toBe(120);
        expect(s1.hours[21]).toBe(0);

        const s2 = addReading(s1, new Date(2026, 8, 15, 22, 40), { sec: 60, pages: 1, chars: 400 });
        expect(s2.days['2026-09-15'].sec).toBe(180);
        expect(s2.hours[22]).toBe(180);
    });

    it('不同日期各记各的', () => {
        let s = emptyStats();
        s = addReading(s, new Date(2026, 8, 14, 9, 0), { sec: 60 });
        s = addReading(s, new Date(2026, 8, 15, 9, 0), { sec: 90 });
        expect(s.days['2026-09-14'].sec).toBe(60);
        expect(s.days['2026-09-15'].sec).toBe(90);
    });

    it('recentKeys 从今天往前数 n 天（老 → 新，跨月也对）', () => {
        expect(recentKeys('2026-09-15', 7)).toEqual([
            '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13', '2026-09-14', '2026-09-15',
        ]);
        expect(recentKeys('2026-03-02', 3)).toEqual(['2026-02-28', '2026-03-01', '2026-03-02']);
    });

    it('sumDays 合计一段日期；没记过的那天算 0 不炸', () => {
        let s = emptyStats();
        s = addReading(s, new Date(2026, 8, 14, 9, 0), { sec: 60, pages: 2, chars: 300 });
        s = addReading(s, new Date(2026, 8, 15, 9, 0), { sec: 90, pages: 1, chars: 600 });
        const t = sumDays(s.days, ['2026-09-13', '2026-09-14', '2026-09-15']);
        expect(t).toEqual({ sec: 150, pages: 3, chars: 900 });
    });

    it('streakDays 连着读几天；今天没读就从昨天开始数', () => {
        let s = emptyStats();
        for (const d of [12, 13, 14, 15]) s = addReading(s, new Date(2026, 8, d, 9, 0), { sec: 60 });
        expect(streakDays(s.days, '2026-09-15')).toBe(4);
        expect(streakDays(s.days, '2026-09-16')).toBe(4);   // 16 号还没读，往前数还是 4
    });

    it('中间断一天就停', () => {
        let s = emptyStats();
        s = addReading(s, new Date(2026, 8, 12, 9, 0), { sec: 60 });
        s = addReading(s, new Date(2026, 8, 15, 9, 0), { sec: 60 });
        expect(streakDays(s.days, '2026-09-15')).toBe(1);
    });

    it('热力分档：0 / 1 / 2 / 3 / 4', () => {
        expect(heatLevel(0, 100)).toBe(0);
        expect(heatLevel(100, 0)).toBe(0);
        expect(heatLevel(10, 100)).toBe(1);
        expect(heatLevel(30, 100)).toBe(2);
        expect(heatLevel(60, 100)).toBe(3);
        expect(heatLevel(90, 100)).toBe(4);
    });

    it('时长与字数的写法', () => {
        expect(fmtSec(45)).toEqual({ big: '45', unit: '秒' });
        expect(fmtSec(600)).toEqual({ big: '10', unit: '分钟' });
        expect(fmtSec(3600 * 2 + 600)).toEqual({ big: '2 小时 10 分', unit: '' });
        expect(fmtChars(520)).toEqual({ big: '520', unit: '字' });
        expect(fmtChars(139400)).toEqual({ big: '13.9', unit: '万字' });
    });
});
