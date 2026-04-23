import { useEffect, useRef } from 'react';

/**
 * Calls the given callback on a fixed interval (default 30 seconds).
 * The timer resets whenever the callback reference changes so that a
 * manual fetch (e.g. after a create / update / delete) doesn't collide
 * with the next scheduled refresh.
 */
export function useAutoRefresh(
  callback: () => void,
  deps: unknown[] = [],
  intervalMs = 30_000,
) {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  const depsKey = JSON.stringify(deps);

  useEffect(() => {
    const id = setInterval(() => savedCallback.current(), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, depsKey]);
}
