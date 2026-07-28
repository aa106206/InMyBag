/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

export const Brand = {
  primary: '#C7B8EA',
  primarySoft: '#F8C8DC',
  secondary: '#FFF3E6',
  lavender: '#C7B8EA',
  lavenderDeep: '#8F82D8',
  text: '#111827',
  inkSoft: '#253047',
  muted: '#6B7280',
  mutedSoft: '#9CA3AF',
  surface: '#FFFFFF',
  surfaceWarm: '#FFF3E6',
  surfaceElevated: '#FFFCF8',
  surfaceTint: '#FFF8EF',
  border: '#E6D7DD',
  borderSoft: '#F2E9ED',
  success: '#166534',
  danger: '#D92D20',
  shadow: 'rgba(17, 24, 39, 0.10)',
};

const tintColorLight = Brand.text;
const tintColorDark = Brand.lavender;

export const Colors = {
  light: {
    text: Brand.text,
    background: Brand.secondary,
    tint: tintColorLight,
    icon: Brand.muted,
    tabIconDefault: Brand.muted,
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#FFF3E6',
    background: '#111827',
    tint: tintColorDark,
    icon: '#C7B8EA',
    tabIconDefault: '#6B7280',
    tabIconSelected: tintColorDark,
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
