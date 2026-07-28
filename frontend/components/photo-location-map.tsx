import { StyleSheet } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";

import { Brand } from "@/constants/theme";

export type PhotoLocationMapProps = {
  latitude: number;
  longitude: number;
  title: string;
  description?: string;
};

export function PhotoLocationMap({
  latitude,
  longitude,
  title,
  description,
}: PhotoLocationMapProps) {
  return (
    <MapView
      provider={PROVIDER_GOOGLE}
      style={styles.map}
      initialRegion={{
        latitude,
        longitude,
        latitudeDelta: 0.004,
        longitudeDelta: 0.004,
      }}
      scrollEnabled={false}
      zoomEnabled={false}
      rotateEnabled={false}
      pitchEnabled={false}
    >
      <Marker coordinate={{ latitude, longitude }} title={title} description={description} />
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: {
    height: 120,
    marginTop: 6,
    overflow: "hidden",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Brand.border,
  },
});
