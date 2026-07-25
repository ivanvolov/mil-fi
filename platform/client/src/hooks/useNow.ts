import { useEffect, useState } from 'react';

/** Live clock: re-renders the caller every `intervalMs` (default 1s) so countdown timers tick. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
