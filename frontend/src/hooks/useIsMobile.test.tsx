import { renderHook } from '@testing-library/react';
import useIsMobile from './useIsMobile';

/**
 * MUI's ``useMediaQuery`` reads ``window.matchMedia``. JSDOM doesn't ship
 * one, so we install a fake whose `matches` answer depends only on whether
 * the query mentions ``max-width`` (which is the shape produced by
 * ``theme.breakpoints.down('md')``).
 */
function setMatch(answer: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: answer && /max-width/.test(query),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

describe('useIsMobile', () => {
  it('returns false on a desktop-sized viewport', () => {
    setMatch(false);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it('returns true when the down-md media query matches', () => {
    setMatch(true);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });
});
