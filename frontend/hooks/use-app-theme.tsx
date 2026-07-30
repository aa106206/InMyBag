import { createContext, ReactNode, useContext, useMemo, useState } from "react";

import { Brand } from "@/constants/theme";

export const BAG_THEME_COLORS = [
  Brand.secondary,
  "#E8F6CB",
  "#E2F1F2",
  "#E9A8A3",
  "#D9D9D9",
];

type AppThemeContextValue = {
  warmBackground: string;
  setWarmBackground: (color: string) => void;
};

const AppThemeContext = createContext<AppThemeContextValue | null>(null);

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [warmBackground, setWarmBackground] = useState(Brand.secondary);

  const value = useMemo(
    () => ({
      warmBackground,
      setWarmBackground,
    }),
    [warmBackground],
  );

  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>;
}

export function useAppTheme() {
  const value = useContext(AppThemeContext);

  if (!value) {
    throw new Error("useAppTheme must be used within AppThemeProvider");
  }

  return value;
}
