export const severityColor = (sev: string): string => {
  switch ((sev || '').toLowerCase()) {
    case 'critical': return '#d32f2f';
    case 'high': return '#f44336';
    case 'medium': return '#ff9800';
    case 'low': return '#9e9e9e';
    default: return '#9e9e9e';
  }
};
