import React from 'react';
import {SafeAreaView, View, Text, StatusBar, StyleSheet} from 'react-native';

function App() {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.card}>
        <Text style={styles.logoText}>SL</Text>
        <Text style={styles.nameText}>SETLIVE</Text>
        <Text style={styles.subText}>License Tools</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: 220,
    height: 220,
    borderRadius: 24,
    backgroundColor: '#020617',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#22c55e',
  },
  logoText: {
    fontSize: 64,
    fontWeight: '800',
    color: '#22c55e',
    marginBottom: 8,
  },
  nameText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#e5e7eb',
  },
  subText: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 4,
  },
});

export default App;
