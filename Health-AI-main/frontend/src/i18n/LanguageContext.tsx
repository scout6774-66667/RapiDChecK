import React, { createContext, useContext, useState, useEffect, useMemo, type ReactNode } from 'react';
import { translations, type Language, type TranslationSchema } from './translations';

const STORAGE_KEY = 'ruralhealth-language';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, fallback?: string) => string;
  strings: TranslationSchema;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode; initialLang?: Language }> = ({
  children,
  initialLang,
}) => {
  const [language, setLanguageState] = useState<Language>(() => {
    if (initialLang) return initialLang;
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as Language;
      if (saved === 'en' || saved === 'hi' || saved === 'bn') {
        return saved;
      }
    } catch {
      // ignore localStorage errors (e.g. sandboxed iframe)
    }
    return 'en';
  });

  const setLanguage = (newLang: Language) => {
    setLanguageState(newLang);
    try {
      localStorage.setItem(STORAGE_KEY, newLang);
    } catch {
      // ignore localStorage errors
    }
  };

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as Language;
      if (saved && saved !== language && (saved === 'en' || saved === 'hi' || saved === 'bn')) {
        setLanguageState(saved);
      }
    } catch {
      // ignore
    }
  }, []);

  const strings = useMemo(() => {
    return translations[language] || translations.en;
  }, [language]);

  /**
   * Helper to look up translation by dot-notation (e.g. 'hero.titleLine1') or flat key ('appTitle')
   */
  const t = useMemo(() => {
    return (key: string, fallback?: string): string => {
      const current = translations[language] || translations.en;
      const fallbackDict = translations.en;

      const keys = key.split('.');
      let result: any = current;
      for (const k of keys) {
        if (result && typeof result === 'object' && k in result) {
          result = result[k];
        } else {
          result = undefined;
          break;
        }
      }

      if (typeof result === 'string') return result;

      // Try fallback to English dictionary
      let fallbackResult: any = fallbackDict;
      for (const k of keys) {
        if (fallbackResult && typeof fallbackResult === 'object' && k in fallbackResult) {
          fallbackResult = fallbackResult[k];
        } else {
          fallbackResult = undefined;
          break;
        }
      }

      if (typeof fallbackResult === 'string') return fallbackResult;

      return fallback ?? key;
    };
  }, [language]);

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      t,
      strings,
    }),
    [language, t, strings]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    // Graceful fallback if rendered outside provider
    const fallbackLang: Language = 'en';
    const current = translations[fallbackLang];
    return {
      language: fallbackLang,
      setLanguage: () => {},
      strings: current,
      t: (key: string, fallback?: string) => {
        const keys = key.split('.');
        let res: any = current;
        for (const k of keys) {
          if (res && typeof res === 'object' && k in res) {
            res = res[k];
          } else {
            return fallback ?? key;
          }
        }
        return typeof res === 'string' ? res : (fallback ?? key);
      },
    };
  }
  return context;
};
