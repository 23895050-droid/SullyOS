import { describe, expect, it } from 'vitest';
import {
    addReading, dayKeyOf, dayBooks, efficiency, emptyStats, fmtChars, fmtClock, fmtSec, heatLevel,
    partSeconds, peakPart, recentKeys, streakDays, sumDays, sumHours,
} from './readerStats';

describe('readerStats · 阅读流水', () => {
    it('日期键走本地时间（不能用 UTC——半夜读的会被记到前一天）', () => {
        const d = new Date(2026, 8, 15, 0, 30);   // 2026-09-15 00:30 本地
        expect(dayKeyOf(d)).toBe('2026-09-15');
    });

    it('记一笔落在「那一天 + 那一个小时」两个格子里', () => {
        const s0 = emptyStats();
        const s1 = addReading(s0, new Date(2026, 8, 15, 22, 10), { sec: 120, pages: 3, chars: 900 });
        expect(s1.days['2026-09-15'].sec).toBe(120);
        expect(s1.days['2026-09-15'].pages).toBe(3);
        expect(s1.days['2026-09-15'].chars).toBe(900);
        // 小时桶在**这一天**里（以前是全局一格的，所以「阅读习惯」不分视图——她报过）
        expect(s1.days['2026-09-15'].hours[22]).toBe(120);
        expect(s1.days['2026-09-15'].hours[21]).toBe(0);

        const s2 = addReading(s1, new Date(2026, 8, 15, 22, 40), { sec: 60, pages: 1, chars: 400 });
        expect(s2.days['2026-09-15'].sec).toBe(180);
        expect(s2.days['2026-09-15'].hours[22]).toBe(180);
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
        expect(t.sec).toBe(150);
        expect(t.pages).toBe(3);
        expect(t.chars).toBe(900);
        expect(t.hours[9]).toBe(150);       // 两天都是 9 点读的，小时桶相加
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

    it('每小时落在自己那天的小时桶里（跨天的两笔不会混）', () => {
        let s = emptyStats();
        s = addReading(s, new Date(2026, 8, 14, 21, 0), { sec: 600 });
        s = addReading(s, new Date(2026, 8, 15, 21, 0), { sec: 300 });
        expect(s.days['2026-09-14'].hours[21]).toBe(600);
        expect(s.days['2026-09-15'].hours[21]).toBe(300);
        expect(sumHours(s.days, ['2026-09-14'])[21]).toBe(600);
        expect(sumHours(s.days, ['2026-09-14', '2026-09-15'])[21]).toBe(900);
    });

    it('分书记账：时长/翻页/打开次数/首末时刻各归各的', () => {
        let s = emptyStats();
        s = addReading(s, new Date(2026, 8, 15, 9, 0), { sec: 60, pages: 2, bookId: 'a', open: true });
        s = addReading(s, new Date(2026, 8, 15, 10, 0), { sec: 30, pages: 1, bookId: 'b', open: true });
        s = addReading(s, new Date(2026, 8, 15, 11, 0), { sec: 90, bookId: 'a' });
        const d = s.days['2026-09-15'];
        expect(d.opens).toBe(2);
        expect(d.books.a).toMatchObject({ sec: 150, pages: 2, opens: 1 });
        expect(d.books.b).toMatchObject({ sec: 30, pages: 1, opens: 1 });
        expect(d.books.a.hours[9]).toBe(60);
        expect(d.books.a.hours[11]).toBe(90);
        expect(fmtClock(d.books.a.firstAt)).toBe('09:00');
        expect(fmtClock(d.books.a.lastAt)).toBe('11:00');
        // 读得多的排前面
        expect(dayBooks(d).map((x) => x.bookId)).toEqual(['a', 'b']);
    });

    it('时段分布：早上/下午/晚上/夜里，百分比加起来 100', () => {
        const hours = new Array(24).fill(0);
        hours[9] = 100;      // 早上
        hours[15] = 200;     // 下午
        hours[21] = 100;     // 晚上
        const parts = partSeconds(hours);
        expect(parts.map((p) => p.key)).toEqual(['早上', '下午', '晚上', '夜里']);
        expect(parts.find((p) => p.key === '下午')?.sec).toBe(200);
        expect(parts.reduce((n, p) => n + p.pct, 0)).toBe(100);
        expect(peakPart(hours)).toEqual({ key: '下午', sec: 200 });
        expect(peakPart(new Array(24).fill(0))).toBeNull();
    });

    it('效率四件套：空的一天不除零', () => {
        const e0 = efficiency(emptyStats().days['x'] ?? { sec: 0, pages: 0, chars: 0, opens: 0, hours: [], books: {} });
        expect(e0.secPerBook).toBe(0);
        expect(e0.pagesPerMin).toBe(0);
        let s = emptyStats();
        s = addReading(s, new Date(2026, 8, 15, 9, 0), { sec: 600, pages: 10, bookId: 'a', open: true });
        s = addReading(s, new Date(2026, 8, 15, 9, 30), { sec: 600, pages: 10, bookId: 'b', open: true });
        const e = efficiency(s.days['2026-09-15']);
        expect(e.secPerBook).toBe(600);
        expect(e.secPerPage).toBe(60);
        expect(e.pagesPerMin).toBe(1);
        expect(e.timesPerBook).toBe(1);
    });
});
