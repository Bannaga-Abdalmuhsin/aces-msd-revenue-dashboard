import { createContext, useContext, useEffect, useMemo, useState } from 'react';
const ThemeContext = createContext(null);
const STORAGE_KEY = 'aces-msd-theme';
export function ThemeProvider({ children }) {
    const [theme, setTheme] = useState(() => {
        if (typeof window === 'undefined')
            return 'light';
        const stored = window.localStorage.getItem(STORAGE_KEY);
        return stored === 'dark' ? 'dark' : 'light';
    });
    useEffect(() => {
        const root = document.documentElement;
        if (theme === 'dark') {
            root.classList.add('dark');
        }
        else {
            root.classList.remove('dark');
        }
        window.localStorage.setItem(STORAGE_KEY, theme);
    }, [theme]);
    const value = useMemo(() => ({
        theme,
        toggleTheme: () => setTheme((t) => (t === 'light' ? 'dark' : 'light')),
    }), [theme]);
    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
export function useTheme() {
    const ctx = useContext(ThemeContext);
    if (!ctx)
        throw new Error('useTheme must be used within ThemeProvider');
    return ctx;
}
