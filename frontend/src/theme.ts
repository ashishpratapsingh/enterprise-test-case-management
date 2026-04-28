import { createTheme, Theme } from '@mui/material';

export type ColorMode = 'light' | 'dark';

const baseShadows = [
  'none',
  '0 1px 3px rgba(26,35,126,0.06), 0 1px 2px rgba(26,35,126,0.04)',
  '0 2px 6px rgba(26,35,126,0.08), 0 1px 3px rgba(26,35,126,0.04)',
  '0 4px 12px rgba(26,35,126,0.08), 0 2px 4px rgba(26,35,126,0.04)',
  '0 6px 16px rgba(26,35,126,0.10), 0 3px 6px rgba(26,35,126,0.06)',
  '0 8px 24px rgba(26,35,126,0.12), 0 4px 8px rgba(26,35,126,0.06)',
  '0 12px 32px rgba(26,35,126,0.12), 0 6px 12px rgba(26,35,126,0.06)',
  '0 16px 40px rgba(26,35,126,0.14), 0 8px 16px rgba(26,35,126,0.06)',
  '0 20px 48px rgba(26,35,126,0.14)',
  '0 24px 56px rgba(26,35,126,0.14)',
  '0 28px 64px rgba(26,35,126,0.14)',
  '0 32px 72px rgba(26,35,126,0.14)',
  '0 36px 80px rgba(26,35,126,0.14)',
  '0 40px 88px rgba(26,35,126,0.14)',
  '0 44px 96px rgba(26,35,126,0.14)',
  '0 48px 104px rgba(26,35,126,0.14)',
  '0 52px 112px rgba(26,35,126,0.14)',
  '0 56px 120px rgba(26,35,126,0.14)',
  '0 60px 128px rgba(26,35,126,0.14)',
  '0 64px 136px rgba(26,35,126,0.14)',
  '0 68px 144px rgba(26,35,126,0.14)',
  '0 72px 152px rgba(26,35,126,0.14)',
  '0 76px 160px rgba(26,35,126,0.14)',
  '0 80px 168px rgba(26,35,126,0.14)',
  '0 84px 176px rgba(26,35,126,0.14)',
];

/**
 * Build the MUI theme for either color mode.
 *
 * Brand colors (primary orange, secondary indigo) are consistent across
 * modes. Surfaces (background / paper / divider / table-head bg) flip
 * for dark mode.
 */
export function createAppTheme(mode: ColorMode): Theme {
  const isDark = mode === 'dark';

  const palette = {
    mode,
    primary: {
      main: '#f57c00',
      light: '#ffb74d',
      dark: '#e65100',
      contrastText: '#ffffff',
    },
    secondary: {
      main: isDark ? '#5c6bc0' : '#1a237e',
      light: '#7986cb',
      dark: '#0d1642',
      contrastText: '#ffffff',
    },
    background: {
      default: isDark ? '#0f1117' : '#f5f7fa',
      paper: isDark ? '#1a1d27' : '#ffffff',
    },
    text: {
      primary: isDark ? '#e6e7eb' : '#1a1a2e',
      secondary: isDark ? '#9aa0aa' : '#6b7280',
    },
    error: { main: '#ef4444' },
    warning: { main: '#f59e0b' },
    success: { main: '#10b981' },
    info: { main: '#3b82f6' },
    divider: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(26, 35, 126, 0.08)',
  } as const;

  const tableHeadBg = isDark ? '#252836' : '#f5f7fa';
  const tableHeadColor = isDark ? '#9aa0aa' : '#1a237e';
  const drawerBorder = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(26, 35, 126, 0.06)';

  return createTheme({
    palette,
    typography: {
      fontFamily: '"DM Sans", "Inter", "Helvetica", "Arial", sans-serif',
      h1: { fontWeight: 700 },
      h2: { fontWeight: 700 },
      h3: { fontWeight: 600 },
      h4: { fontWeight: 600 },
      h5: { fontWeight: 600 },
      h6: { fontWeight: 600 },
      button: { fontWeight: 600 },
    },
    shape: { borderRadius: 10 },
    shadows: baseShadows as any,
    components: {
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            borderRadius: 8,
            fontWeight: 600,
            padding: '8px 20px',
            boxShadow: 'none',
            '&:hover': {
              boxShadow: '0 4px 12px rgba(245, 124, 0, 0.25)',
            },
          },
          containedPrimary: {
            background: 'linear-gradient(135deg, #f57c00 0%, #e65100 100%)',
            '&:hover': {
              background: 'linear-gradient(135deg, #ffb74d 0%, #f57c00 100%)',
            },
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: 12,
            border: `1px solid ${palette.divider}`,
            boxShadow: isDark
              ? '0 2px 8px rgba(0,0,0,0.4)'
              : '0 2px 8px rgba(26,35,126,0.06)',
            '&:hover': {
              boxShadow: isDark
                ? '0 4px 16px rgba(0,0,0,0.5)'
                : '0 4px 16px rgba(26,35,126,0.10)',
            },
            transition: 'box-shadow 0.2s ease',
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            boxShadow: '0 1px 3px rgba(26,35,126,0.08)',
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            border: 'none',
            boxShadow: isDark
              ? '1px 0 3px rgba(0,0,0,0.4)'
              : '1px 0 3px rgba(26,35,126,0.06)',
            backgroundColor: palette.background.paper,
            borderRight: `1px solid ${drawerBorder}`,
          },
        },
      },
      MuiTextField: {
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-root': { borderRadius: 8 },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { borderRadius: 6, fontWeight: 500 },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            '&.Mui-selected': {
              backgroundColor: 'rgba(245, 124, 0, 0.08)',
              color: '#f57c00',
              '&:hover': {
                backgroundColor: 'rgba(245, 124, 0, 0.12)',
              },
              '& .MuiListItemIcon-root': { color: '#f57c00' },
            },
          },
        },
      },
      MuiTableHead: {
        styleOverrides: {
          root: {
            '& .MuiTableCell-head': {
              fontWeight: 600,
              backgroundColor: tableHeadBg,
              color: tableHeadColor,
            },
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: { borderRadius: 12 },
        },
      },
    },
  });
}
