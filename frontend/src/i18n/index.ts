/**
 * i18next bootstrap.
 *
 * Currently English-only, but the file structure (``locales/<lang>.json``)
 * is set up so additional locales can be added without touching call
 * sites — drop ``locales/de.json`` (etc.) and register it in ``resources``
 * below.
 *
 * Strings are referenced with namespaced keys like ``nav.dashboard``;
 * call ``useTranslation()`` in a component and ``t('nav.dashboard')``.
 *
 * Browser language is auto-detected (querystring → cookie → localStorage
 * → navigator) by ``i18next-browser-languagedetector``. If detection
 * fails or the detected language has no resource bundle, we fall back
 * to ``en``.
 */

import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
    },
    fallbackLng: 'en',
    supportedLngs: ['en'],
    interpolation: {
      escapeValue: false, // React already escapes
    },
    detection: {
      order: ['querystring', 'cookie', 'localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'tcm.lang',
    },
  });

export default i18n;
