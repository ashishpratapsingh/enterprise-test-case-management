import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { SnackbarProvider } from 'notistack';
import App from './App';
import { AuthContext, useAuthProvider } from './hooks/useAuth';
import { ProjectProvider } from './contexts/ProjectContext';
import { ColorModeProvider } from './contexts/ColorModeContext';

const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const auth = useAuthProvider();
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
};

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

root.render(
  <React.StrictMode>
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <ColorModeProvider>
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
      </ColorModeProvider>
    </BrowserRouter>
  </React.StrictMode>
);
