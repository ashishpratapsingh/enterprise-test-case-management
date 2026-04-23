import { renderHook } from '@testing-library/react';
import { useAutoRefresh } from './useAutoRefresh';

jest.useFakeTimers();

describe('useAutoRefresh', () => {
  afterEach(() => {
    jest.clearAllTimers();
  });

  it('calls the callback at the configured interval', () => {
    const cb = jest.fn();
    renderHook(() => useAutoRefresh(cb, [], 1000));

    expect(cb).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1000);
    expect(cb).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(2000);
    expect(cb).toHaveBeenCalledTimes(3);
  });

  it('uses the latest callback reference on each tick', () => {
    const first = jest.fn();
    const second = jest.fn();
    const { rerender } = renderHook(({ cb }) => useAutoRefresh(cb, [], 1000), {
      initialProps: { cb: first },
    });

    jest.advanceTimersByTime(1000);
    expect(first).toHaveBeenCalledTimes(1);

    rerender({ cb: second });
    jest.advanceTimersByTime(1000);
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledTimes(1);
  });

  it('resets the timer when deps change', () => {
    const cb = jest.fn();
    const { rerender } = renderHook(
      ({ deps }) => useAutoRefresh(cb, deps, 1000),
      { initialProps: { deps: [1] as unknown[] } },
    );

    jest.advanceTimersByTime(500);
    rerender({ deps: [2] });
    // After deps change, a fresh interval starts — 500ms more shouldn't fire yet
    jest.advanceTimersByTime(500);
    expect(cb).toHaveBeenCalledTimes(0);
    jest.advanceTimersByTime(500);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('cleans up the interval on unmount', () => {
    const cb = jest.fn();
    const { unmount } = renderHook(() => useAutoRefresh(cb, [], 1000));
    unmount();
    jest.advanceTimersByTime(5000);
    expect(cb).not.toHaveBeenCalled();
  });
});
