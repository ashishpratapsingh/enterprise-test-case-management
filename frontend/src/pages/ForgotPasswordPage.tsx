import React, { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
  Link,
} from '@mui/material';
import authService from '../services/authService';
import sabpaisaLogo from '../assets/sabpaisa-logo.svg';

const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [devResetLink, setDevResetLink] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await authService.requestPasswordReset(email);
      setSubmitted(true);
      // Dev affordance: the backend echoes the token only when DEBUG=true.
      if (result?.reset_token) {
        setDevResetLink(`/reset-password?token=${encodeURIComponent(result.reset_token)}`);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Something went wrong. Try again.');
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
      sx={{ background: 'linear-gradient(135deg, #1a237e 0%, #0d1642 50%, #f57c00 100%)' }}
    >
      <Card sx={{ maxWidth: 440, width: '100%', mx: 2, borderRadius: 3, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <CardContent sx={{ p: 5 }}>
          <Box display="flex" flexDirection="column" alignItems="center" mb={3}>
            <img src={sabpaisaLogo} alt="SabPaisa" style={{ height: 48, marginBottom: 12 }} />
            <Typography variant="h6" fontWeight={600} sx={{ color: '#1a237e', mt: 1 }}>
              Forgot your password?
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1, textAlign: 'center' }}>
              Enter your email and we'll send you a link to reset it.
            </Typography>
          </Box>

          {submitted ? (
            <>
              <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>
                If that email is registered, a reset link has been issued. Check your inbox.
              </Alert>
              {devResetLink && (
                <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
                  <Typography variant="caption" display="block" fontWeight={600}>
                    Dev mode — open the reset link directly:
                  </Typography>
                  <Link component={RouterLink} to={devResetLink}>
                    {devResetLink}
                  </Link>
                </Alert>
              )}
              <Button
                component={RouterLink}
                to="/login"
                fullWidth
                variant="outlined"
                size="large"
                sx={{ mt: 1 }}
              >
                Back to Login
              </Button>
            </>
          ) : (
            <form onSubmit={handleSubmit}>
              {error && (
                <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>
              )}
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
                }}
              >
                {loading ? <CircularProgress size={24} color="inherit" /> : 'Send reset link'}
              </Button>
              <Box textAlign="center" mt={2}>
                <Link component={RouterLink} to="/login" variant="body2">
                  Back to Login
                </Link>
              </Box>
            </form>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default ForgotPasswordPage;
