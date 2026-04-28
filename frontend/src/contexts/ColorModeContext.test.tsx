import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ColorModeProvider, useColorMode } from './ColorModeContext';

const STORAGE_KEY = 'tcm.colorMode';

const Probe: React.FC = () => {
  const { mode, toggle, setMode } = useColorMode();
  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <button onClick={toggle}>toggle</button>
      <button onClick={() => setMode('dark')}>force-dark</button>
    </div>
  );
};

describe('ColorModeProvider', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('defaults to light mode when nothing is stored', () => {
    render(
      <ColorModeProvider>
        <Probe />
      </ColorModeProvider>,
    );
    expect(screen.getByTestId('mode').textContent).toBe('light');
  });

  it('reads the persisted mode from localStorage on mount', () => {
    window.localStorage.setItem(STORAGE_KEY, 'dark');
    render(
      <ColorModeProvider>
        <Probe />
      </ColorModeProvider>,
    );
    expect(screen.getByTestId('mode').textContent).toBe('dark');
  });

  it('toggles between light and dark', () => {
    render(
      <ColorModeProvider>
        <Probe />
      </ColorModeProvider>,
    );
    expect(screen.getByTestId('mode').textContent).toBe('light');
    act(() => {
      fireEvent.click(screen.getByText('toggle'));
    });
    expect(screen.getByTestId('mode').textContent).toBe('dark');
    act(() => {
      fireEvent.click(screen.getByText('toggle'));
    });
    expect(screen.getByTestId('mode').textContent).toBe('light');
  });

  it('persists changes to localStorage', () => {
    render(
      <ColorModeProvider>
        <Probe />
      </ColorModeProvider>,
    );
    act(() => {
      fireEvent.click(screen.getByText('force-dark'));
    });
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('dark');
  });

  it('ignores invalid stored values and falls back to light', () => {
    window.localStorage.setItem(STORAGE_KEY, 'midnight-blue');
    render(
      <ColorModeProvider>
        <Probe />
      </ColorModeProvider>,
    );
    expect(screen.getByTestId('mode').textContent).toBe('light');
  });
});
