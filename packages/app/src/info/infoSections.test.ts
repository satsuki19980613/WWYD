import { describe, expect, it } from 'vitest';
import { INFO_SECTIONS, infoSectionFor } from './infoSections.ts';

describe('infoSectionFor', () => {
  it('通常時は画面ごとの節', () => {
    expect(infoSectionFor('ready', 'list', false)).toBe('list');
    expect(infoSectionFor('ready', 'new', false)).toBe('new');
    expect(infoSectionFor('ready', 'answer', false)).toBe('answer');
    expect(infoSectionFor('ready', 'result', false)).toBe('result');
  });

  it('アカウントメニューを開いている間と規約ページはアカウントの節', () => {
    expect(infoSectionFor('ready', 'list', true)).toBe('account');
    expect(infoSectionFor('ready', 'terms', false)).toBe('account');
    expect(infoSectionFor('signedOut', 'privacy', false)).toBe('account');
  });

  it('未ログイン・メンテナンス中などはアプリの説明', () => {
    expect(infoSectionFor('signedOut', 'list', false)).toBe('login');
    expect(infoSectionFor('maintenance', 'answer', false)).toBe('login');
    expect(infoSectionFor('ready', 'notFound', false)).toBe('login');
  });
});

describe('INFO_SECTIONS', () => {
  it('すべての節に見出しと本文がある', () => {
    for (const section of Object.values(INFO_SECTIONS)) {
      expect(section.items.length).toBeGreaterThan(0);
      for (const item of section.items) {
        expect(item.term.trim()).not.toBe('');
        expect(item.desc.trim()).not.toBe('');
      }
    }
  });
});

describe('INFO_SECTIONS は必要最小限（2026-09-29 さつき: 情報が多すぎる）', () => {
  it('1 節は 7 項目まで、本文は 1 項目 70 文字まで', () => {
    for (const section of Object.values(INFO_SECTIONS)) {
      expect(section.items.length).toBeLessThanOrEqual(7);
      for (const item of section.items) expect([...item.desc].length, item.term).toBeLessThanOrEqual(70);
    }
  });
});
