import { describe, expect, it } from 'vitest';
import { parseRoute, routePath, type Route } from './router.ts';

describe('parseRoute', () => {
  it.each<[string, Route]>([
    ['/', { name: 'list' }],
    ['', { name: 'list' }],
    ['/new', { name: 'new' }],
    ['/new/', { name: 'new' }],
    ['/drafts', { name: 'drafts' }],
    ['/terms', { name: 'terms' }],
    ['/privacy', { name: 'privacy' }],
    ['/s/abc-123', { name: 'spot', id: 'abc-123' }],
    ['/s/abc-123/answer', { name: 'answer', id: 'abc-123' }],
    ['/s/abc-123/result', { name: 'result', id: 'abc-123' }],
    ['/s/abc-123/result/', { name: 'result', id: 'abc-123' }],
  ])('%s', (path, expected) => {
    expect(parseRoute(path)).toEqual(expected);
  });

  it.each(['/s', '/s/', '/s/a/b', '/s/a/edit', '/s/%E0%A4%A', '/s/a%2Fb', '/x', '/new//', '/news'])(
    '%s は 404',
    (path) => {
      expect(parseRoute(path)).toEqual({ name: 'notFound' });
    },
  );

  it('部品一覧は開発時だけ', () => {
    expect(parseRoute('/_dev/ui', true)).toEqual({ name: 'devUi' });
    expect(parseRoute('/_dev/ui', false)).toEqual({ name: 'notFound' });
  });
});

describe('routePath', () => {
  it.each<Route>([
    { name: 'list' },
    { name: 'new' },
    { name: 'drafts' },
    { name: 'spot', id: 'p1' },
    { name: 'answer', id: 'p1' },
    { name: 'result', id: 'p1' },
    { name: 'terms' },
    { name: 'privacy' },
  ])('parseRoute と往復する: %o', (route) => {
    expect(parseRoute(routePath(route))).toEqual(route);
  });
});
