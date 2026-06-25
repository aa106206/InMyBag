import { Image, ScrollView, StyleSheet, Text, View } from "react-native";

import { Brand } from "@/constants/theme";

const categories = ["캠퍼스", "카페", "운동", "여행"];

const tips = [
  {
    title: "Bag Stack으로 기록",
    description: "오늘 챙긴 물건을 사진으로 남기고 한 화면에 쌓아보세요.",
  },
  {
    title: "피드에서 공유",
    description: "사진과 메모를 함께 올려 나만의 일상 루틴을 보여줄 수 있어요.",
  },
  {
    title: "취향 발견",
    description: "비슷한 상황의 가방을 구경하며 필요한 아이템을 빠르게 찾습니다.",
  },
];

export default function ExploreScreen() {
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Image source={require("@/assets/images/InMyBag.png")} style={styles.logoImage} />
        <Text style={styles.brand}>InMyBag</Text>
        <Text style={styles.subtitle}>가방 속 물건으로 연결되는 취향 커뮤니티</Text>
      </View>

      <View style={styles.searchCard}>
        <Text style={styles.searchLabel}>지금 많이 보는 가방</Text>
        <View style={styles.categoryRow}>
          {categories.map((category) => (
            <View key={category} style={styles.categoryChip}>
              <Text style={styles.categoryText}>{category}</Text>
            </View>
          ))}
        </View>
      </View>

      <Text style={styles.sectionTitle}>서비스 흐름</Text>
      {tips.map((tip, index) => (
        <View key={tip.title} style={styles.tipCard}>
          <View style={styles.stepBadge}>
            <Text style={styles.stepText}>{index + 1}</Text>
          </View>
          <View style={styles.tipCopy}>
            <Text style={styles.tipTitle}>{tip.title}</Text>
            <Text style={styles.tipDescription}>{tip.description}</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Brand.secondary,
  },
  contentContainer: {
    padding: 18,
    paddingTop: 28,
    paddingBottom: 32,
  },
  header: {
    alignItems: "center",
    backgroundColor: Brand.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Brand.border,
    padding: 22,
  },
  logoImage: {
    width: 92,
    height: 92,
    borderRadius: 24,
    marginBottom: 12,
  },
  brand: {
    color: Brand.primary,
    fontSize: 34,
    fontWeight: "900",
  },
  subtitle: {
    color: Brand.muted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
    textAlign: "center",
  },
  searchCard: {
    backgroundColor: Brand.primary,
    borderRadius: 8,
    padding: 18,
    marginTop: 16,
  },
  searchLabel: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 14,
  },
  categoryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  categoryChip: {
    backgroundColor: "#FFFFFF",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  categoryText: {
    color: Brand.primary,
    fontSize: 14,
    fontWeight: "800",
  },
  sectionTitle: {
    color: Brand.text,
    fontSize: 20,
    fontWeight: "900",
    marginTop: 24,
    marginBottom: 12,
  },
  tipCard: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: Brand.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Brand.border,
    padding: 16,
    marginBottom: 10,
  },
  stepBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Brand.primary,
  },
  stepText: {
    color: "#FFFFFF",
    fontWeight: "900",
  },
  tipCopy: {
    flex: 1,
  },
  tipTitle: {
    color: Brand.text,
    fontSize: 17,
    fontWeight: "900",
  },
  tipDescription: {
    color: Brand.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 5,
  },
});
