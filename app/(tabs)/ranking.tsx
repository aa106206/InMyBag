import { StyleSheet, View } from 'react-native';

import { Brand } from '@/constants/theme';

export default function RankingScreen() {
  return <View style={styles.screen} />;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Brand.secondary,
  },
});
