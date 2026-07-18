import { Tabs } from 'expo-router';
import React from 'react';
import { DeviceEventEmitter } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { BAG_STACK_TAB_RESELECT_EVENT } from '@/constants/tab-events';
import { Brand, Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

const TAB_BAR_HEIGHT = 64;
const TAB_ICON_SIZE = 30;
const FEED_TAB_ICON_SIZE = 32;

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 8);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        tabBarInactiveTintColor: Colors[colorScheme ?? 'light'].tabIconDefault,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: Brand.surface,
          borderTopColor: Brand.border,
          height: TAB_BAR_HEIGHT + bottomInset,
          paddingBottom: bottomInset,
          paddingTop: 8,
        },
      }}
    >
      <Tabs.Screen
        name="bagstack"
        listeners={({ navigation }) => ({
          tabPress: () => {
            if (navigation.isFocused()) {
              DeviceEventEmitter.emit(BAG_STACK_TAB_RESELECT_EVENT);
            }
          },
        })}
        options={{
          title: '내 가방',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={TAB_ICON_SIZE} name="bag.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: 'Feed',
          tabBarIcon: ({ color }) => <IconSymbol size={FEED_TAB_ICON_SIZE} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="ranking"
        options={{
          title: '이야기',
          tabBarIcon: ({ color }) => <IconSymbol size={TAB_ICON_SIZE} name="book.closed.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: '설정',
          tabBarIcon: ({ color }) => <IconSymbol size={TAB_ICON_SIZE} name="gearshape.fill" color={color} />,
        }}
      />
    </Tabs>
  );
}
