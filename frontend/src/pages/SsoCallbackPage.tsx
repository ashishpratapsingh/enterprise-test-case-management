import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation, Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Alert,
  CircularProgress,
  Button,
  Link,
} from '@mui/material';
import authService from '../services/authService';
import { useAuth } from '../hooks/useAuth';

/**
 * Lands here after the backend's /api/v1/auth/sso/callback redirects
 * the browser. Two flavours:
 *
 * - Success: tokens arrive in the URL fragment (#access_token=…). We
 *   read them, store them, fetch the profile, then bounce to the
 *   ``return_to`` path the user originally tried to reach.
 * - Failure: the backend appends ``?error=…``. We render the message
 *   and a "Try again" link back to the login page.
 *
 * The fragment is cleared from the URL bar before navigation so the
 * tokens don't linger in browser history.
 */
const SsoCallbackPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { refreshUser } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Error path: backend used a query-string redirect.
    const search = new URLSearchParams(location.search);
    const errFromQuery = search.get('error');
    if (errFromQuery) {
      setError(errFromQuery);
      return;
    }

    // Success path: tokens in the URL fragment.
    if (!location.hash) {
      setError('Missing SSO response — try signing in again.');
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const { returnTo } = await authService.completeSsoLogin(location.hash);
        if (cancelled) return;
        // Re-read /users/me through AuthContext so the rest of the
        // app sees the freshly-logged-in user without a page reload.
        await refreshUser();
        // Clear the hash from the URL so tokens don't sit in history.
        window.history.replaceState({}, document.title, '/sso/callback');
        navigate(returnTo, { replace: true });
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message || 'SSO login failed');
      }
    })();
    return () => { cancelled = true; };
  }, [location, navigate, refreshUser]);

  return (
    <Box
      display="flex"
      justifyContent="center"
      alignItems="center"
      minHeight="100vh"
      sx={{ background: 'linear-gradient(135deg, #1a237e 0%, #0d1642 50%, #f57c00 100%)' }}
    >
      <Card sx={{ maxWidth: 440, width: '100%', mx: 2, borderRadius: 3 }}>
        <CardContent sx={{ p: 5, textAlign: 'center' }}>
          {error ? (
            <>
              <Alert severity="error" sx={{ mb: 3, textAlign: 'left' }}>
                {error}
              </Alert>
              <Button
                component={RouterLink}
                to="/login"
                variant="contained"
                fullWidth
                size="large"
              >
                Back to Login
              </Button>
              <Box mt={2}>
                <Link component={RouterLink} to="/forgot-password" variant="body2">
                  Forgot password?
                </Link>
              </Box>
            </>
          ) : (
            <>
              <CircularProgress sx={{ mb: 2 }} />
              <Typography variant="body1">
                Finishing single sign-on…
              </Typography>
            </>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default SsoCallbackPage;
