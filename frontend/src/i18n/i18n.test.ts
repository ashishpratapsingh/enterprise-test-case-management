import i18n from './index';

describe('i18n', () => {
  it('loads the en bundle and resolves nav.dashboard', () => {
    expect(i18n.t('nav.dashboard')).toBe('Dashboard');
  });

  it('falls back to en for an unknown lang and returns the resolved string', async () => {
    await i18n.changeLanguage('zz-NOT-A-LANG');
    expect(i18n.t('common.logout')).toBe('Logout');
  });

  it('returns the key untouched for an unknown translation key', () => {
    // Default i18next behaviour: missing keys come back verbatim.
    expect(i18n.t('this.key.does.not.exist')).toBe('this.key.does.not.exist');
  });
});
