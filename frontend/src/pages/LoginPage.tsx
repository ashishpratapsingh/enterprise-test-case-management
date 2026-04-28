import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation, Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
  InputAdornment,
  IconButton,
  Link,
  Divider,
} from '@mui/material';
import { Visibility, VisibilityOff, Login as LoginIcon } from '@mui/icons-material';
import { useAuth } from '../hooks/useAuth';
import authService from '../services/authService';
import sabpaisaLogo from '../assets/sabpaisa-logo.svg';

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // SSO config — fetched once on mount. While we wait, the button
  // simply isn't rendered. If the request fails we silently treat SSO
  // as disabled (login form alone still works).
  const [ssoConfig, setSsoConfig] = useState<{
    enabled: boolean;
    provider_name: string;
  } | null>(null);

  useEffect(() => {
    authService.getSsoConfig().then(setSsoConfig).catch(() => setSsoConfig({
      enabled: false,
      provider_name: '',
    }));
  }, []);

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as any)?.from?.pathname || '/';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login({ email, password });
      navigate(from, { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      display="flex"
      justifyContent="center"
      alignItems="center"
      minHeight="100vh"
      sx={{
        background: 'linear-gradient(135deg, #1a237e 0%, #0d1642 50%, #f57c00 100%)',
      }}
    >
      <Card
        sx={{
          maxWidth: 440,
          width: '100%',
          mx: 2,
          borderRadius: 3,
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          overflow: 'visible',
        }}
      >
        <CardContent sx={{ p: 5 }}>
          <Box display="flex" flexDirection="column" alignItems="center" mb={4}>
            <img
              src={sabpaisaLogo}
              alt="SabPaisa"
              style={{ height: 48, marginBottom: 12 }}
            />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Sign in to your account
            </Typography>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
            <TextField
              label="Email"
              type="email"
              fullWidth
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              margin="normal"
              autoFocus
              autoComplete="email"
            />
            <TextField
              label="Password"
              type={showPassword ? 'text' : 'password'}
              fullWidth
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              margin="normal"
              autoComplete="current-password"
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              disabled={loading}
              sx={{
                mt: 3,
                mb: 1,
                py: 1.5,
                fontSize: '1rem',
                background: 'linear-gradient(135deg, #f57c00 0%, #e65100 100%)',
                '&:hover': {
                  background: 'linear-gradient(135deg, #ffb74d 0%, #f57c00 100%)',
                  boxShadow: '0 6px 20px rgba(245, 124, 0, 0.4)',
                },
              }}
            >
              {loading ? <CircularProgress size={24} color="inherit" /> : 'Sign In'}
            </Button>

            {ssoConfig?.enabled && (
              <>
                <Box display="flex" alignItems="center" gap={1} my={2}>
                  <Divider sx={{ flexGrow: 1 }} />
                  <Typography variant="caption" color="text.secondary">
                    or
                  </Typography>
                  <Divider sx={{ flexGrow: 1 }} />
                </Box>
                <Button
                  fullWidth
                  variant="outlined"
                  size="large"
                  startIcon={<LoginIcon />}
                  onClick={() => authService.beginSsoLogin(from)}
                  sx={{ py: 1.5, fontSize: '0.95rem' }}
                >
                  Sign in with {ssoConfig.provider_name || 'SSO'}
                </Button>
              </>
            )}

            <Box textAlign="center" mt={1}>
              <Link component={RouterLink} to="/forgot-password" variant="body2">
                Forgot password?
              </Link>
            </Box>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
};

export default LoginPage;
