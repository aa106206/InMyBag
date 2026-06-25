import { Image, ScrollView, StyleSheet, Text, View } from "react-native";

import { Brand } from "@/constants/theme";

const posts = [
  {
    id: 1,
    user: "james",
    title: "오늘 내 가방",
    memo: "노트북, 충전기, 에어팟, 지갑",
    image: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=900",
    likes: 24,
  },
  {
    id: 2,
    user: "minsu",
    title: "카페 공부템",
    memo: "아이패드랑 필기구 챙김",
    image: "https://images.unsplash.com/photo-1491336477066-31156b5e4f35?w=900",
    likes: 13,
  },
  {
    id: 3,
    user: "yuna",
    title: "운동 가방",
    memo: "운동복, 물병, 수건",
    image: "https://images.unsplash.com/photo-1556906781-9a412961c28c?w=900",
    likes: 31,
  },
];

export default function HomeScreen() {
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.brandHeader}>
        <Image source={require("@/assets/images/InMyBag.png")} style={styles.logoImage} />
        <View style={styles.brandCopy}>
          <Text style={styles.logo}>InMyBag</Text>
          <Text style={styles.subtitle}>내 가방 속 취향을 공유하는 SNS</Text>
        </View>
      </View>

      <View style={styles.hero}>
        <Text style={styles.heroEyebrow}>오늘의 Bag Feed</Text>
        <Text style={styles.heroTitle}>가방 속 물건으로 취향을 발견해요</Text>
        <Text style={styles.heroText}>
          일상템, 공부템, 운동템을 사진과 메모로 남기고 친구들의 가방을 구경해보세요.
        </Text>
      </View>

      {posts.map((post) => (
        <View key={post.id} style={styles.card}>
          <View style={styles.header}>
            <View style={styles.profileCircle}>
              <Text style={styles.profileText}>{post.user[0].toUpperCase()}</Text>
            </View>
            <Text style={styles.userName}>@{post.user}</Text>
          </View>

          <Image source={{ uri: post.image }} style={styles.image} />

          <View style={styles.content}>
            <Text style={styles.title}>{post.title}</Text>
            <Text style={styles.memo}>{post.memo}</Text>
            <Text style={styles.likes}>좋아요 {post.likes}개</Text>
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
    paddingBottom: 28,
  },
  brandHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 24,
    marginBottom: 18,
  },
  logoImage: {
    width: 58,
    height: 58,
    borderRadius: 16,
  },
  brandCopy: {
    flex: 1,
  },
  logo: {
    fontSize: 30,
    fontWeight: "900",
    color: Brand.primary,
  },
  subtitle: {
    fontSize: 15,
    color: Brand.muted,
    marginTop: 4,
  },
  hero: {
    backgroundColor: Brand.primary,
    borderRadius: 8,
    padding: 18,
    marginBottom: 18,
  },
  heroEyebrow: {
    color: "#DCE6FF",
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 8,
  },
  heroTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "900",
    lineHeight: 30,
  },
  heroText: {
    color: "#EAF0FF",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
  },
  card: {
    backgroundColor: Brand.surface,
    borderRadius: 8,
    marginBottom: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Brand.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
  },
  profileCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Brand.primary,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  profileText: {
    color: "white",
    fontWeight: "800",
  },
  userName: {
    fontSize: 15,
    fontWeight: "700",
    color: Brand.text,
  },
  image: {
    width: "100%",
    height: 280,
  },
  content: {
    padding: 15,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: Brand.text,
  },
  memo: {
    fontSize: 15,
    color: Brand.muted,
    marginTop: 6,
  },
  likes: {
    fontSize: 14,
    color: Brand.primary,
    fontWeight: "700",
    marginTop: 12,
  },
});
