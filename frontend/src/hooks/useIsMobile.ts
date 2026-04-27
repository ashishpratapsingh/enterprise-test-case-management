import { useMediaQuery, useTheme } from '@mui/material';

/**
 * Returns ``true`` when the viewport is below the MUI ``md`` breakpoint
 * (< 900px). Used to flip dialogs to full-screen, hide secondary chrome,
 * and pick mobile vs. desktop drawer variants.
 */
export function useIsMobile(): boolean {
  const theme = useTheme();
  return useMediaQuery(theme.breakpoints.down('md'));
}

export default useIsMobile;
