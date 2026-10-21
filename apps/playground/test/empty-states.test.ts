import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// 界面模块在加载时读取地址栏和浏览器语言
vi.stubGlobal('location', new URL('http://localhost/'));
vi.stubGlobal('document', { documentElement: { dataset: {} } });
const { i18n } = await import('../src/app-i18n');
const { countText } = await import('../src/presentation/format');
const { BusyList } = await import('../src/pages/occupancy/view');
const { StopList } = await import('../src/pages/trail/view');

i18n.setLocale('en');

describe('empty lists say why they are empty', () => {
  it('the heatmap list without reports', () => {
    const ctx = { venue: {}, index: {}, departmentOfUnit: () => null } as never;
    const html = renderToStaticMarkup(createElement(BusyList, { ctx, rows: [], reports: 0 }));
    expect(html).toContain('No location reports for the selected period');
  });

  it('the heatmap list while its first ranking is still being computed', () => {
    // 已有上报但排名还没算出来时不能说“没有上报”
    const ctx = { venue: {}, index: {}, departmentOfUnit: () => null } as never;
    const html = renderToStaticMarkup(createElement(BusyList, { ctx, rows: [], reports: 329 }));
    expect(html).not.toContain('No location reports');
  });

  it('the trail without stops', () => {
    const props = { ctx: {} as never, person: {} as never, stops: [], onStop: () => {} };
    const html = renderToStaticMarkup(createElement(StopList, props));
    expect(html).toContain('No stops recorded in the selected period');
  });
});

describe('counts in English', () => {
  it('use the singular for one', () => {
    expect(countText(1, 'detail.device', 'detail.devices')).toBe('1 device');
    expect(countText(2, 'detail.device', 'detail.devices')).toBe('2 devices');
    expect(countText(0, 'busy.report', 'busy.reports')).toBe('0 reports');
    expect(countText(1, 'busy.report', 'busy.reports')).toBe('1 report');
  });

  it('keep one form in Chinese and Japanese', () => {
    i18n.setLocale('ja');
    expect(countText(1, 'detail.device', 'detail.devices')).toBe('1 台');
    i18n.setLocale('en');
  });
});
