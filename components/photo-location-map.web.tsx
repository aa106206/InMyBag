import { StyleSheet, Text, View } from 'react-native';

import { Brand } from '@/constants/theme';

import type { PhotoLocationMapProps } from './photo-location-map';

// react-native-maps는 웹을 지원하지 않으므로 웹에서는 위치 정보만 카드로 보여준다.
export function PhotoLocationMap({ latitude, longitude, description }: PhotoLocationMapProps) {
  return (
    <View style={styles.placeholder}>
      <Text style={styles.pin}>📍</Text>
      {description ? <Text style={styles.name}>{description}</Text> : null}
      <Text style={styles.coords}>
        {latitude.toFixed(5)}, {longitude.toFixed(5)}
      </Text>
      <Text style={styles.note}>지도는 모바일 앱에서 볼 수 있어요.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    height: 180,
    marginTop: 6,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Brand.border,
    backgroundColor: Brand.secondary,
  },
  pin: {
    fontSize: 28,
  },
  name: {
    color: Brand.text,
    fontSize: 14,
    fontWeight: '900',
  },
  coords: {
    color: Brand.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  note: {
    marginTop: 4,
    color: Brand.muted,
    fontSize: 12,
    fontWeight: '700',
  },
});
