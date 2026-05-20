import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { createFakeSocket, type FakeSocket } from './__test-utils__/fakeSocket';

let fake: FakeSocket;

vi.mock('./useSocket', () => ({
  useSocket: () => fake,
}));

import { useSocketEvent } from './useSocketEvent';

function Harness({ onPong }: { onPong: (p: unknown) => void }): ReactElement {
  useSocketEvent('pong', onPong);
  return <div />;
}

describe('useSocketEvent', () => {
  beforeEach(() => {
    fake = createFakeSocket();
  });

  it('subscribes and validates payload via Zod', () => {
    const onPong = vi.fn();
    render(<Harness onPong={onPong} />);

    fake.trigger('pong', { nonce: 'n1', serverTs: 1, seq: 0 });
    expect(onPong).toHaveBeenCalledWith({ nonce: 'n1', serverTs: 1, seq: 0 });
  });

  it('throws on invalid payload in dev', () => {
    const onPong = vi.fn();
    render(<Harness onPong={onPong} />);

    expect(() => { fake.trigger('pong', { nonce: '', serverTs: -1, seq: 0 }); }).toThrow(
      /invalid socket payload for pong/,
    );
    expect(onPong).not.toHaveBeenCalled();
  });

  it('unsubscribes on unmount', () => {
    const onPong = vi.fn();
    const view = render(<Harness onPong={onPong} />);
    view.unmount();
    fake.trigger('pong', { nonce: 'n1', serverTs: 1, seq: 0 });
    expect(onPong).not.toHaveBeenCalled();
  });
});
