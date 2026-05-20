import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createFakeSocket, type FakeSocket } from './__test-utils__/fakeSocket';

let fake: FakeSocket | null;

vi.mock('./useSocket', () => ({
  useSocket: () => fake,
}));

import {
  SyncController,
  registerSyncHandler,
  _getRegistry,
  _resetRegistry,
} from './sync.controller';

function withQueryClient(node: ReactElement): ReactElement {
  const client = new QueryClient();
  function Wrapper({ children }: { children: ReactNode }): ReactElement {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return <Wrapper>{node}</Wrapper>;
}

describe('SyncController', () => {
  beforeEach(() => {
    _resetRegistry();
    fake = createFakeSocket();
  });

  it('invokes registered handlers when socket is available', () => {
    const teardown = vi.fn();
    const handler = vi.fn(() => teardown);
    registerSyncHandler(handler);

    const view = render(withQueryClient(<SyncController />));
    expect(handler).toHaveBeenCalledWith(fake, expect.any(QueryClient));
    expect(_getRegistry()).toHaveLength(1);

    view.unmount();
    expect(teardown).toHaveBeenCalledTimes(1);
  });

  it('does nothing when socket is null', () => {
    fake = null;
    const teardown = vi.fn();
    const handler = vi.fn(() => teardown);
    registerSyncHandler(handler);
    render(withQueryClient(<SyncController />));
    expect(handler).not.toHaveBeenCalled();
  });
});
