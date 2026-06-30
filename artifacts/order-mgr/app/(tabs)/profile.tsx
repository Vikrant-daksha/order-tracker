import { Feather } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useDatabase } from '@/context/DatabaseContext';
import { exportBackup, exportCSV } from '@/utils/csvExport';

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { orders, products, clearDeliveredImages, importBackup } = useDatabase();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const stats = useMemo(() => {
    const outstanding = orders.reduce((s, o) => s + Math.max(0, o.price - o.amountPaid), 0);
    const unpaid = orders.filter(o => o.paymentStatus === 'Unpaid');
    const partial = orders.filter(o => o.paymentStatus === 'Partial');
    const customers = new Set(orders.map(o => o.customerName)).size;
    return { outstanding, unpaid, partial, customers };
  }, [orders]);

  async function handleClearCache() {
    Alert.alert(
      'Clear Image Cache',
      'This removes images from delivered orders to free up space. Order records are kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear', style: 'destructive', onPress: async () => {
            const count = await clearDeliveredImages();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert('Done', `Cleared images from ${count} delivered orders.`);
          }
        }
      ]
    );
  }

  async function handleExportCSV() {
    await exportCSV(orders);
  }

  async function handleBackup() {
    await exportBackup(orders, products);
  }

  async function handleRestore() {
    if (Platform.OS === 'web') {
      Alert.alert('Not supported', 'Use the native app to restore from backup.');
      return;
    }
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/json' });
      if (result.canceled || !result.assets[0]) return;
      const text = await FileSystem.readAsStringAsync(result.assets[0].uri);
      const data = JSON.parse(text);
      if (!data.orders || !data.products) {
        Alert.alert('Invalid backup', 'This file is not a valid OrderFlow backup.');
        return;
      }
      Alert.alert(
        'Restore Backup',
        `This will replace ALL current data with ${data.orders.length} orders. Continue?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Restore', style: 'destructive', onPress: async () => {
              await importBackup(data);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert('Restored', 'Your data has been restored.');
            }
          }
        ]
      );
    } catch {
      Alert.alert('Error', 'Could not read backup file.');
    }
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: Platform.OS === 'web' ? 100 : insets.bottom + 100 }}>
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Profile</Text>
      </View>

      {/* Outstanding Payments */}
      <View style={[styles.outstandingCard, { backgroundColor: colors.unpaid }]}>
        <View style={styles.outstandingRow}>
          <Feather name="dollar-sign" size={22} color={colors.unpaidText} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.outstandingLabel, { color: colors.unpaidText }]}>Outstanding Balance</Text>
            <Text style={[styles.outstandingValue, { color: colors.unpaidText }]}>₹{stats.outstanding.toFixed(2)}</Text>
          </View>
        </View>
        <View style={styles.paymentBreakdown}>
          <View style={styles.paymentItem}>
            <View style={[styles.dot, { backgroundColor: colors.unpaidText }]} />
            <Text style={[styles.paymentLabel, { color: colors.unpaidText }]}>{stats.unpaid.length} Unpaid</Text>
          </View>
          <View style={styles.paymentItem}>
            <View style={[styles.dot, { backgroundColor: colors.partialText }]} />
            <Text style={[styles.paymentLabel, { color: colors.partialText }]}>{stats.partial.length} Partial</Text>
          </View>
        </View>
      </View>

      {/* Quick Stats */}
      <View style={styles.statsRow}>
        <View style={[styles.statBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.statValue, { color: colors.foreground }]}>{orders.length}</Text>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Total Orders</Text>
        </View>
        <View style={[styles.statBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.statValue, { color: colors.foreground }]}>{products.length}</Text>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Products</Text>
        </View>
        <View style={[styles.statBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.statValue, { color: colors.foreground }]}>{stats.customers}</Text>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Customers</Text>
        </View>
      </View>

      {/* Menu Sections */}
      <MenuItem
        icon="users"
        label="Customer Profiles"
        subtitle="View all customer history"
        onPress={() => router.push('/customers' as any)}
        colors={colors}
      />

      <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>DATA</Text>

        <MenuRow icon="download" label="Export CSV" subtitle="Download order spreadsheet" onPress={handleExportCSV} colors={colors} />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <MenuRow icon="upload-cloud" label="Backup Data" subtitle="Export all data as JSON" onPress={handleBackup} colors={colors} />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <MenuRow icon="download-cloud" label="Restore Backup" subtitle="Import from JSON backup" onPress={handleRestore} colors={colors} />
      </View>

      <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>STORAGE</Text>
        <MenuRow
          icon="trash-2"
          label="Clear Image Cache"
          subtitle="Free space from delivered orders"
          onPress={handleClearCache}
          colors={colors}
          destructive
        />
      </View>
    </ScrollView>
  );
}

function MenuItem({ icon, label, subtitle, onPress, colors }: any) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.menuItem, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.8 : 1 }]}
    >
      <View style={[styles.menuIcon, { backgroundColor: colors.accent }]}>
        <Feather name={icon} size={18} color="#C06070" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.menuLabel, { color: colors.foreground }]}>{label}</Text>
        {subtitle && <Text style={[styles.menuSub, { color: colors.mutedForeground }]}>{subtitle}</Text>}
      </View>
      <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
    </Pressable>
  );
}

function MenuRow({ icon, label, subtitle, onPress, colors, destructive }: any) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.menuRow, { opacity: pressed ? 0.7 : 1 }]}>
      <Feather name={icon} size={18} color={destructive ? colors.destructive : colors.mutedForeground} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.menuRowLabel, { color: destructive ? colors.destructive : colors.foreground }]}>{label}</Text>
        {subtitle && <Text style={[styles.menuSub, { color: colors.mutedForeground }]}>{subtitle}</Text>}
      </View>
      <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 16 },
  title: { fontSize: 28, fontFamily: 'Inter_700Bold' },
  outstandingCard: { marginHorizontal: 16, marginBottom: 14, borderRadius: 16, padding: 18, gap: 12 },
  outstandingRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  outstandingLabel: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  outstandingValue: { fontSize: 28, fontFamily: 'Inter_700Bold' },
  paymentBreakdown: { flexDirection: 'row', gap: 16 },
  paymentItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  paymentLabel: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  statsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 14 },
  statBox: { flex: 1, borderRadius: 14, borderWidth: 1, padding: 14, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  statLabel: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  menuItem: {
    marginHorizontal: 16, marginBottom: 10, borderRadius: 16, borderWidth: 1,
    padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14,
  },
  menuIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  menuLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  menuSub: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 1 },
  section: { marginHorizontal: 16, marginBottom: 14, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  sectionTitle: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 16 },
  menuRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 14 },
  menuRowLabel: { fontSize: 15, fontFamily: 'Inter_500Medium' },
});
