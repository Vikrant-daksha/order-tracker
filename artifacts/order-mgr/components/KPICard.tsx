import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

interface KPICardProps {
  label: string;
  value: string;
  icon: string;
  trend?: string;
  trendUp?: boolean;
  accent?: string;
}

export function KPICard({ label, value, icon, trend, trendUp, accent }: KPICardProps) {
  const colors = useColors();
  const accentColor = accent || colors.primary;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, shadowColor: '#000' }]}>
      <View style={[styles.iconWrap, { backgroundColor: accentColor + '22' }]}>
        <Feather name={icon as any} size={18} color={accentColor === colors.primary ? '#C06070' : accentColor} />
      </View>
      <Text style={[styles.value, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.label, { color: colors.mutedForeground }]}>{label}</Text>
      {trend && (
        <View style={styles.trendRow}>
          <Feather
            name={trendUp ? 'trending-up' : 'trending-down'}
            size={12}
            color={trendUp ? colors.deliveredText : colors.overdueText}
          />
          <Text style={[styles.trend, { color: trendUp ? colors.deliveredText : colors.overdueText }]}>{trend}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 16,
    gap: 6,
    flex: 1,
    minWidth: 140,
    ...Platform.select({
      ios: { shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8 },
      android: { elevation: 3 },
    }),
  },
  iconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  value: { fontSize: 24, fontFamily: 'Inter_700Bold' },
  label: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  trend: { fontSize: 12, fontFamily: 'Inter_500Medium' },
});
