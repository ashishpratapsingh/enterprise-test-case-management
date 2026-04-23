import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { SnackbarProvider } from 'notistack';
import App from './App';
import { AuthContext, useAuthProvider } from './hooks/useAuth';
import { ProjectProvider } from './contexts/ProjectContext';

const theme = createTheme({
  palette: {
    primary: {
      main: '#f57c00',
      light: '#ffb74d',
      dark: '#e65100',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#1a237e',
      light: '#5c6bc0',
      dark: '#0d1642',
      contrastText: '#ffffff',
    },
    background: {
      default: '#f5f7fa',
      paper: '#ffffff',
    },
    text: {
      primary: '#1a1a2e',
      secondary: '#6b7280',
    },
    error: {
      main: '#ef4444',
    },
    warning: {
      main: '#f59e0b',
    },
    success: {
      main: '#10b981',
    },
    info: {
      main: '#3b82f6',
    },
    divider: 'rgba(26, 35, 126, 0.08)',
  },
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
  shape: {
    borderRadius: 10,
  },
  shadows: [
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
  ] as any,
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
          border: '1px solid rgba(26, 35, 126, 0.06)',
          boxShadow: '0 2px 8px rgba(26,35,126,0.06)',
          '&:hover': {
            boxShadow: '0 4px 16px rgba(26,35,126,0.10)',
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
          boxShadow: '1px 0 3px rgba(26,35,126,0.06)',
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 8,
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          fontWeight: 500,
        },
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
            '& .MuiListItemIcon-root': {
              color: '#f57c00',
            },
          },
        },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          '& .MuiTableCell-head': {
            fontWeight: 600,
            backgroundColor: '#f5f7fa',
            color: '#1a237e',
          },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 12,
        },
      },
    },
  },
});

const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const auth = useAuthProvider();
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
};

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

root.render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <SnackbarProvider
          maxSnack={3}
          anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
          autoHideDuration={4000}
        >
          <AuthProvider>
            <ProjectProvider>
              <App />
            </ProjectProvider>
          </AuthProvider>
        </SnackbarProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);
