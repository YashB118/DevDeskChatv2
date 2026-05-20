import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import { readLocal, removeLocal, writeLocal } from './localStorage';

const Pref = z.object({ unreadOnly: z.boolean() });

beforeEach(() => {
  window.localStorage.clear();
});

describe('localStorage helpers', () => {
  it('round-trips a value through Zod', () => {
    writeLocal('pref', { unreadOnly: true });
    expect(readLocal('pref', Pref)).toEqual({ unreadOnly: true });
  });

  it('returns null when nothing is stored', () => {
    expect(readLocal('pref', Pref)).toBeNull();
  });

  it('deletes corrupted JSON and returns null', () => {
    window.localStorage.setItem('pref', '{not-json');
    expect(readLocal('pref', Pref)).toBeNull();
    expect(window.localStorage.getItem('pref')).toBeNull();
  });

  it('deletes payloads that fail schema check', () => {
    writeLocal('pref', { unreadOnly: 'yes' });
    expect(readLocal('pref', Pref)).toBeNull();
    expect(window.localStorage.getItem('pref')).toBeNull();
  });

  it('removeLocal clears the key', () => {
    writeLocal('pref', { unreadOnly: true });
    removeLocal('pref');
    expect(readLocal('pref', Pref)).toBeNull();
  });
});
