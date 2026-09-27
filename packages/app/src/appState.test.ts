import { describe, expect, it } from 'vitest';
import { classifyReachability, type Reachability } from './appState.ts';

describe('classifyReachability', () => {
  it.each<[Reachability, boolean, 'offline' | 'maintenance' | null]>([
    [{ kind: 'ok' }, true, null],
    [{ kind: 'ok' }, false, null],
    [{ kind: 'http', status: 401 }, true, null],
    [{ kind: 'http', status: 404 }, true, null],
    [{ kind: 'http', status: 500 }, true, 'maintenance'],
    [{ kind: 'http', status: 503 }, true, 'maintenance'],
    [{ kind: 'timeout' }, true, 'maintenance'],
    [{ kind: 'network' }, true, 'maintenance'],
    [{ kind: 'network' }, false, 'offline'],
    [{ kind: 'timeout' }, false, 'offline'],
    [{ kind: 'http', status: 503 }, false, 'offline'],
  ])('%o / online=%s → %s', (result, online, expected) => {
    expect(classifyReachability(result, online)).toBe(expected);
  });
});
