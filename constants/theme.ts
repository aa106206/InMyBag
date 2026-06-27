/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

export const Brand = {
  primary: '#FF9EBB',
  primarySoft: '#FFD1DC',
  secondary: '#FFF0F6',
  lavender: '#B8C0FF',
  text: '#1F2937',
  muted: '#7B6672',
  surface: '#FFFFFF',
  surfaceWarm: '#FFF7FA',
  border: '#F2C9D7',
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
    text: '#FFF0F6',
    background: '#1F2937',
    tint: tintColorDark,
    icon: '#FFD1DC',
    tabIconDefault: '#C9B9C2',
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
