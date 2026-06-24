import { Image, ScrollView, StyleSheet, Text, View } from "react-native";

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
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <Text style={styles.logo}>InMyBag</Text>
      <Text style={styles.subtitle}>내 가방 속 취향을 공유하는 SNS</Text>

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
            <Text style={styles.likes}>♡ {post.likes} likes</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F7F3EA",
    padding: 18,
  },
  logo: {
    fontSize: 36,
    fontWeight: "900",
    color: "#2F261D",
    marginTop: 24,
  },
  subtitle: {
    fontSize: 15,
    color: "#7A6A58",
    marginTop: 4,
    marginBottom: 22,
  },
  card: {
    backgroundColor: "white",
    borderRadius: 24,
    marginBottom: 22,
    overflow: "hidden",
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
    backgroundColor: "#2F261D",
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
    color: "#2F261D",
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
    color: "#2F261D",
  },
  memo: {
    fontSize: 15,
    color: "#5D5144",
    marginTop: 6,
  },
  likes: {
    fontSize: 14,
    color: "#A36A3D",
    fontWeight: "700",
    marginTop: 12,
  },
});