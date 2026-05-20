import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function read(): boolean {
  if (typeof window === 'undefined') return false;
  // window.matchMedia may be missing in some environments (older browsers, test stubs).
  const mm: typeof window.matchMedia | undefined = window.matchMedia;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!mm) return false;
  return mm(QUERY).matches;
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(read);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mm: typeof window.matchMedia | undefined = window.matchMedia;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!mm) return;
    const mq = mm(QUERY);
    const onChange = (): void => { setReduced(mq.matches); };
    setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => { mq.removeEventListener('change', onChange); };
  }, []);

  return reduced;
}
