import { describe, expect, it } from 'vitest';
import { TraceMethod } from './trace-method.decorator';

class Sample {
  @TraceMethod()
  async work(x: number): Promise<number> {
    return x * 2;
  }

  @TraceMethod({ name: 'custom.span' })
  sync(x: number): number {
    return x + 1;
  }

  @TraceMethod()
  async fails(): Promise<number> {
    throw new Error('boom');
  }
}

describe('@TraceMethod', () => {
  it('passes async results through unchanged', async () => {
    const s = new Sample();
    await expect(s.work(3)).resolves.toBe(6);
  });

  it('passes sync results through unchanged', () => {
    const s = new Sample();
    expect(s.sync(4)).toBe(5);
  });

  it('rethrows the original error', async () => {
    const s = new Sample();
    await expect(s.fails()).rejects.toThrow('boom');
  });
});
