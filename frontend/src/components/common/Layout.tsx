import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import {
  AppBar,
  Box,
  CssBaseline,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Toolbar,
  Typography,
  Avatar,
  Tooltip,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Dashboard as DashboardIcon,
  Folder as FolderIcon,
  Description as DescriptionIcon,
  Assignment as RequirementsIcon,
  PlaylistAddCheck as SuiteIcon,
  PlayArrow as RunIcon,
  BugReport as BugIcon,
  Assessment as ReportIcon,
  People as PeopleIcon,
  History as AuditIcon,
  AccountCircle,
  ChevronLeft as ChevronLeftIcon,
  Brightness4 as DarkModeIcon,
  Brightness7 as LightModeIcon,
  Security as SecurityIcon,
} from '@mui/icons-material';
import { useAuth } from '../../hooks/useAuth';
import { canManageUsers } from '../../utils/roleGuard';
import { useColorMode } from '../../contexts/ColorModeContext';
import sabpaisaLogo from '../../assets/sabpaisa-logo.svg';
import sabpaisaLogoWhite from '../../assets/sabpaisa-logo-white.svg';

const DRAWER_WIDTH = 260;

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  visible: boolean;
}

const Layout: React.FC = () => {
  const muiTheme = useTheme();
  // ``md`` breakpoint = 900px. Below it, the drawer is a temporary
  // overlay (taps outside dismiss it) and the main canvas spans the
  // full viewport. Above it, the drawer is persistent and pushes the
  // main canvas — same behaviour as before.
  const isMobile = useMediaQuery(muiTheme.breakpoints.down('md'));
  const [drawerOpen, setDrawerOpen] = useState(!isMobile);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { mode, toggle: toggleColorMode } = useColorMode();

  // Snap drawer state when crossing the breakpoint so it doesn't get
  // stuck open/closed in the wrong mode after a window resize.
  useEffect(() => {
    setDrawerOpen(!isMobile);
  }, [isMobile]);

  const handleNavigate = (path: string) => {
    navigate(path);
    if (isMobile) setDrawerOpen(false);
  };

  const navItems: NavItem[] = [
    { label: 'Dashboard', path: '/', icon: <DashboardIcon />, visible: true },
    { label: 'Projects', path: '/projects', icon: <FolderIcon />, visible: true },
    { label: 'Requirements', path: '/requirements', icon: <RequirementsIcon />, visible: true },
    { label: 'Test Cases', path: '/test-cases', icon: <DescriptionIcon />, visible: true },
    { label: 'Test Suites', path: '/test-suites', icon: <SuiteIcon />, visible: true },
    { label: 'Test Runs', path: '/test-runs', icon: <RunIcon />, visible: true },
    { label: 'Defects', path: '/defects', icon: <BugIcon />, visible: true },
    { label: 'Reports', path: '/reports', icon: <ReportIcon />, visible: true },
    {
      label: 'Users',
      path: '/users',
      icon: <PeopleIcon />,
      visible: user ? canManageUsers(user.role) : false,
    },
    {
      label: 'Roles',
      path: '/roles',
      icon: <SecurityIcon />,
      visible: user ? canManageUsers(user.role) : false,
    },
    {
      label: 'Audit Log',
      path: '/audit',
      icon: <AuditIcon />,
      visible: user ? canManageUsers(user.role) : false,
    },
  ];

  const handleLogout = async () => {
    setAnchorEl(null);
    await logout();
    navigate('/login');
  };

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <Box sx={{ display: 'flex' }}>
      <CssBaseline />

      {/* App Bar */}
      <AppBar
        position="fixed"
        sx={{
          zIndex: (theme) => theme.zIndex.drawer + 1,
          // On mobile the drawer is a transient overlay, so the AppBar
          // always spans the full viewport. On desktop it shrinks when
          // the persistent drawer is open.
          ml: !isMobile && drawerOpen ? `${DRAWER_WIDTH}px` : 0,
          width:
            !isMobile && drawerOpen ? `calc(100% - ${DRAWER_WIDTH}px)` : '100%',
          transition: (theme) =>
            theme.transitions.create(['width', 'margin'], {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.leavingScreen,
            }),
          background: 'linear-gradient(135deg, #1a237e 0%, #0d1642 100%)',
          backdropFilter: 'blur(10px)',
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            edge="start"
            onClick={() => setDrawerOpen(!drawerOpen)}
            sx={{ mr: 2 }}
          >
            {drawerOpen ? <ChevronLeftIcon /> : <MenuIcon />}
          </IconButton>
          <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center' }}>
            <img
              src={sabpaisaLogoWhite}
              alt="SabPaisa"
              style={{ height: 32 }}
            />
          </Box>
          {user && (
            <Box display="flex" alignItems="center" gap={1}>
              <Tooltip title={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
                <IconButton
                  color="inherit"
                  onClick={toggleColorMode}
                  aria-label="Toggle color mode"
                >
                  {mode === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}
                </IconButton>
              </Tooltip>
              {/* Hide the (potentially long) full-name on small screens so
                  the AppBar doesn't push the avatar off-screen. The name
                  is still accessible via the account menu. */}
              <Typography
                variant="body2"
                sx={{ opacity: 0.9, display: { xs: 'none', sm: 'block' } }}
              >
                {user.full_name || user.email}
              </Typography>
              <Tooltip title="Account">
                <IconButton color="inherit" onClick={(e) => setAnchorEl(e.currentTarget)}>
                  <Avatar
                    sx={{
                      width: 34,
                      height: 34,
                      bgcolor: '#f57c00',
                      fontSize: 14,
                      fontWeight: 600,
                    }}
                  >
                    {(user.full_name || user.email || '?')[0].toUpperCase()}
                  </Avatar>
                </IconButton>
              </Tooltip>
              <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={() => setAnchorEl(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                PaperProps={{
                  sx: { borderRadius: 2, mt: 1, minWidth: 200 },
                }}
              >
                <MenuItem disabled>
                  <AccountCircle sx={{ mr: 1, color: '#f57c00' }} />
                  {user.email}
                </MenuItem>
                <MenuItem disabled>
                  Role: {(user.role || '').charAt(0).toUpperCase() + (user.role || '').slice(1)}
                </MenuItem>
                <Divider />
                <MenuItem onClick={handleLogout} sx={{ color: '#f57c00' }}>
                  Logout
                </MenuItem>
              </Menu>
            </Box>
          )}
        </Toolbar>
      </AppBar>

      {/* Sidebar Drawer
          Mobile (< md): temporary overlay, dismissed by tapping outside
          or selecting a nav item. Desktop: persistent, pushes the
          main canvas. Same paper colors / theme rules apply to both. */}
      <Drawer
        variant={isMobile ? 'temporary' : 'persistent'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            backgroundColor: 'background.paper',
            borderRight: 1,
            borderColor: 'divider',
          },
        }}
      >
        <Toolbar />
        <Box sx={{ overflow: 'auto', mt: 1, px: 1 }}>
          <List>
            {navItems
              .filter((item) => item.visible)
              .map((item) => (
                <ListItem key={item.path} disablePadding sx={{ mb: 0.5 }}>
                  <ListItemButton
                    selected={isActive(item.path)}
                    onClick={() => handleNavigate(item.path)}
                    sx={{
                      borderRadius: 2,
                      py: 1.2,
                      '&.Mui-selected': {
                        background: 'linear-gradient(135deg, rgba(245,124,0,0.08) 0%, rgba(26,35,126,0.06) 100%)',
                        color: '#f57c00',
                        '&:hover': {
                          background: 'linear-gradient(135deg, rgba(245,124,0,0.12) 0%, rgba(26,35,126,0.08) 100%)',
                        },
                        '& .MuiListItemIcon-root': {
                          color: '#f57c00',
                        },
                      },
                      '&:hover': {
                        bgcolor: 'action.hover',
                      },
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 40, color: 'text.secondary' }}>{item.icon}</ListItemIcon>
                    <ListItemText
                      primary={item.label}
                      primaryTypographyProps={{
                        fontSize: '0.9rem',
                        fontWeight: isActive(item.path) ? 600 : 500,
                      }}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
          </List>
        </Box>

        {/* Sidebar footer */}
        <Box sx={{ mt: 'auto', p: 2, borderTop: 1, borderColor: 'divider' }}>
          <Box display="flex" alignItems="center" justifyContent="center">
            <img
              src={mode === 'dark' ? sabpaisaLogoWhite : sabpaisaLogo}
              alt="SabPaisa"
              style={{ height: 28, opacity: 0.7 }}
            />
          </Box>
        </Box>
      </Drawer>

      {/* Main Content
          On mobile the temporary drawer overlays this region, so the
          canvas always spans full width and inset padding shrinks for
          smaller viewports. */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 1.5, sm: 2.5, md: 3 },
          ml: !isMobile && drawerOpen ? 0 : (isMobile ? 0 : `-${DRAWER_WIDTH}px`),
          width:
            !isMobile && drawerOpen ? `calc(100% - ${DRAWER_WIDTH}px)` : '100%',
          transition: (theme) =>
            theme.transitions.create(['margin', 'width'], {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.leavingScreen,
            }),
          backgroundColor: 'background.default',
          minHeight: '100vh',
        }}
      >
        <Toolbar />
        <Outlet />
      </Box>
    </Box>
  );
};

export default Layout;
