import { severityColor } from './statusColors';

describe('severityColor', () => {
  it('returns the expected hex per severity', () => {
    expect(severityColor('critical')).toBe('#d32f2f');
    expect(severityColor('high')).toBe('#f44336');
    expect(severityColor('medium')).toBe('#ff9800');
    expect(severityColor('low')).toBe('#9e9e9e');
  });

  it('is case-insensitive', () => {
    expect(severityColor('CRITICAL')).toBe('#d32f2f');
    expect(severityColor('High')).toBe('#f44336');
  });

  it('falls back for unknown / empty inputs', () => {
    expect(severityColor('')).toBe('#9e9e9e');
    expect(severityColor('unknown')).toBe('#9e9e9e');
    expect(severityColor(undefined as any)).toBe('#9e9e9e');
  });
});
