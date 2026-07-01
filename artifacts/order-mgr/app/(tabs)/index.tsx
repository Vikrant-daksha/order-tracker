import { Feather, FontAwesome } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OrderCard } from '@/components/OrderCard';
import { useColors } from '@/hooks/useColors';
import { useDatabase } from '@/context/DatabaseContext';
import { Order } from '@/types';

const PAGE_SIZE = 10;

const BIZ_QUOTES = [
  "Every great business is built one order at a time.",
  "Quality is remembered long after the price is forgotten.",
  "Your craft is your reputation. Make it count.",
  "A happy customer is the best business strategy.",
  "Excellence is not a destination, it's a continuous journey.",
  "Small details create big impressions.",
  "Work hard in silence, let your orders speak.",
];

function getTodayQuote(): string {
  const day = new Date().getDay();
  return BIZ_QUOTES[day % BIZ_QUOTES.length];
}

function isOverdue(order: Order) {
  if (!order.dueDate || order.status === 'Delivered') return false;
  return order.dueDate < new Date().toISOString().split('T')[0];
}

function isDueToday(order: Order) {
  return order.dueDate === new Date().toISOString().split('T')[0];
}

function isDueThisWeek(order: Order) {
  const today = new Date();
  const end = new Date(today);
  end.setDate(today.getDate() + 7);
  const due = new Date(order.dueDate);
  return due >= today && due <= end;
}

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { orders } = useDatabase();
  const [attentionPage, setAttentionPage] = useState(1);
  const [listScrollEnabled, setListScrollEnabled] = useState(true);

  const active = useMemo(() => orders.filter(o => o.status !== 'Delivered'), [orders]);
  const overdue = useMemo(() => active.filter(isOverdue), [active]);
  const dueToday = useMemo(() => active.filter(isDueToday), [active]);
  const dueTomorrow = useMemo(() => active.filter(o => {
    if (!o.dueDate || o.status === 'Delivered') return false;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return o.dueDate === tomorrow.toISOString().split('T')[0];
  }), [active]);
  const dueThisWeek = useMemo(() => active.filter(o => !isDueToday(o) && isDueThisWeek(o)), [active]);
  const outstanding = useMemo(() => orders.reduce((s, o) => s + Math.max(0, o.price - o.amountPaid), 0), [orders]);
  const unpaidCount = useMemo(() => orders.filter(o => o.paymentStatus !== 'Paid').length, [orders]);

  const workingOn = useMemo(() => orders.filter(o => !!o.workingOn), [orders]);

  type FlatListItem =
    | { type: 'header'; id: string; title: string }
    | { type: 'order'; id: string; order: Order; isOverdue: boolean };

  const listItems = useMemo(() => {
    const items: FlatListItem[] = [];
    const overdueList = overdue.filter(o => !o.workingOn);
    const todayList = dueToday.filter(o => !isOverdue(o) && !o.workingOn);
    const tomorrowList = dueTomorrow.filter(o => !o.workingOn);
    // filter out today & tomorrow from this week's upcoming orders
    const tomorrowDateStr = (() => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow.toISOString().split('T')[0];
    })();
    const upcomingList = dueThisWeek.filter(o =>
      o.dueDate !== new Date().toISOString().split('T')[0] &&
      o.dueDate !== tomorrowDateStr &&
      !o.workingOn
    );

    if (overdueList.length > 0) {
      items.push({ type: 'header', id: 'h-overdue', title: 'Overdue' });
      overdueList.forEach(o => items.push({ type: 'order', id: o.id, order: o, isOverdue: true }));
    }
    if (todayList.length > 0) {
      items.push({ type: 'header', id: 'h-today', title: 'Due Today' });
      todayList.forEach(o => items.push({ type: 'order', id: o.id, order: o, isOverdue: false }));
    }
    if (tomorrowList.length > 0) {
      items.push({ type: 'header', id: 'h-tomorrow', title: 'Due Tomorrow' });
      tomorrowList.forEach(o => items.push({ type: 'order', id: o.id, order: o, isOverdue: false }));
    }
    if (upcomingList.length > 0) {
      items.push({ type: 'header', id: 'h-upcoming', title: 'Upcoming (This Week)' });
      upcomingList.forEach(o => items.push({ type: 'order', id: o.id, order: o, isOverdue: false }));
    }
    return items;
  }, [overdue, dueToday, dueTomorrow, dueThisWeek]);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={listItems}
        keyExtractor={item => item.id}
        scrollEnabled={listScrollEnabled}
        renderItem={({ item }) => {
          if (item.type === 'header') {
            return (
              <View style={styles.subdivHeader}>
                <Text style={[styles.subdivTitle, { color: colors.mutedForeground }]}>
                  {item.title.toUpperCase()}
                </Text>
              </View>
            );
          }
          return (
            <OrderCard
              order={item.order}
              isOverdue={item.isOverdue}
              onSwipeActive={active => setListScrollEnabled(!active)}
            />
          );
        }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Platform.OS === 'web' ? 100 : insets.bottom + 100 }}
        ListHeaderComponent={
          <>
            {/* ── Header ─────────────────────────────────────── */}
            <View style={[styles.header, { paddingTop: topPad + 12 }]}>
              <View style={styles.headerLeft}>
                <Text style={[styles.dateLabel, { color: colors.mutedForeground }]}>
                  {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </Text>
                <Text style={[styles.title, { color: colors.foreground }]}>Dashboard</Text>
              </View>
              <Pressable
                onPress={() => router.push('/kanban' as any)}
                style={[styles.headerBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <Feather name="columns" size={17} color={colors.mutedForeground} />
              </Pressable>
            </View>

            {/* ── Stats Row ───────────────────────────────────── */}
            <View style={styles.statsRow}>
              <StatCard
                label="Overdue"
                value={overdue.length}
                accent={overdue.length > 0 ? colors.overdueText : colors.mutedForeground}
                bg={overdue.length > 0 ? colors.overdue : colors.card}
                icon="alert-circle"
                colors={colors}
              />
              <StatCard
                label="Due Today"
                value={dueToday.length}
                accent={dueToday.length > 0 ? colors.shippedText : colors.mutedForeground}
                bg={dueToday.length > 0 ? colors.shipped : colors.card}
                icon="clock"
                colors={colors}
              />
              <StatCard
                label="Unpaid"
                value={`₹${outstanding >= 1000 ? (outstanding / 1000).toFixed(1) + 'k' : outstanding.toFixed(0)}`}
                accent={unpaidCount > 0 ? colors.unpaidText : colors.mutedForeground}
                bg={unpaidCount > 0 ? colors.unpaid : colors.card}
                icon="rupee"
                IconFamily={FontAwesome}
                colors={colors}
              />
            </View>

            {/* ── Working On ──────────────────────────────────── */}
            <SectionHeader
              icon="tool"
              title="Currently Working On"
              action="All orders"
              onAction={() => router.push('/orders' as any)}
              colors={colors}
            />

            {workingOn.length === 0 ? (
              <View style={styles.idleCenteredContainer}>
                <View style={styles.idleCenteredCard}>
                  <Feather name="coffee" size={42} color="#E8A2B5" style={{ marginBottom: 10 }} />
                  <Text style={styles.idleCenteredTitle}>No active work</Text>
                </View>
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.workingScroll}
                style={{ marginBottom: 8 }}
              >
                {workingOn.map(order => (
                  <WorkingCard key={order.id} order={order} colors={colors} router={router} />
                ))}
              </ScrollView>
            )}

            {/* ── Upcoming Due Orders ─────────────────────────────── */}
            <SectionHeader
              icon="alert-circle"
              title="Upcoming Due Orders"
              action="See all"
              onAction={() => router.push('/orders' as any)}
              colors={colors}
              style={{ marginTop: 6 }}
            />
          </>
        }
        ListEmptyComponent={
          listItems.length === 0 ? (
            <View style={styles.empty}>
              <View style={[styles.emptyIconBox, { backgroundColor: colors.accent }]}>
                <Feather name="check-circle" size={28} color="#C06070" />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Nothing urgent</Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                No overdue or upcoming orders — you're on top of things.
              </Text>
            </View>
          ) : null
        }
      />

      <Pressable
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/order/new' as any); }}
        style={[styles.fab, { backgroundColor: colors.primary, bottom: (Platform.OS === 'web' ? 34 : insets.bottom) + 80 }]}
      >
        <Feather name="plus" size={26} color={colors.primaryForeground} />
      </Pressable>
    </View>
  );
}

// ── Section Header ────────────────────────────────────────────────────────────

function SectionHeader({ icon, title, action, onAction, colors, style }: any) {
  return (
    <View style={[styles.sectionHeader, style]}>
      <View style={styles.sectionLeft}>
        <Feather name={icon} size={14} color="#C06070" />
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>
      </View>
      <Pressable onPress={onAction} hitSlop={8}>
        <Text style={[styles.seeAll, { color: '#C06070' }]}>{action}</Text>
      </Pressable>
    </View>
  );
}

// ── Working Card ──────────────────────────────────────────────────────────────

const SOURCE_ICONS: Record<string, string> = {
  Instagram: 'instagram',
  Facebook: 'facebook',
  WhatsApp: 'message-circle',
  Website: 'globe',
  Email: 'mail',
  Manual: 'edit-3',
};

function WorkingCard({ order, colors, router }: { order: Order; colors: any; router: any }) {
  const { toggleWorkingOn, updateOrder } = useDatabase();
  const overdue = isOverdue(order);
  const outstanding = order.price - order.amountPaid;

  function handleReadyToShip() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    updateOrder(order.id, { status: 'Shipped', workingOn: 0 });
  }

  function handleStopWorking() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    toggleWorkingOn(order.id);
  }

  return (
    <Pressable
      style={({ pressed }) => [
        styles.workingCard,
        {
          backgroundColor: colors.card,
          borderColor: overdue ? '#B71C1C' : '#C06070',
          opacity: pressed ? 0.93 : 1,
        },
      ]}
      onPress={() => router.push(`/order/${order.id}` as any)}
    >
      {/* ── Square Image / Icon Hero ── */}
      <View style={styles.wImageWrap}>
        {order.thumbnailPath ? (
          <Image
            source={{ uri: order.thumbnailPath }}
            style={styles.wImage}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.wImagePlaceholder, { backgroundColor: overdue ? '#2D1515' : '#2A1520' }]}>
            <Feather
              name={(SOURCE_ICONS[order.source] as any) || 'package'}
              size={36}
              color={overdue ? '#FF5555' : '#C06070'}
            />
          </View>
        )}
        {/* Due date badge — top left, only shown if due date exists */}
        {order.dueDate ? (
          <View style={[styles.wDueBadge, { backgroundColor: overdue ? '#B71C1C' : 'rgba(0,0,0,0.55)' }]}>
            {overdue && <Feather name="alert-circle" size={9} color="#fff" />}
            <Text style={styles.wDueBadgeText}>
              {overdue ? 'LATE · ' : ''}{order.dueDate.slice(8)}-{order.dueDate.slice(5, 7)}
            </Text>
          </View>
        ) : null}
      </View>

      {/* ── Content: name+product LEFT, price RIGHT ── */}
      <View style={styles.wContent}>
        <View style={styles.wNamePriceRow}>
          {/* Left: name + product */}
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={[styles.wName, { color: colors.foreground }]} numberOfLines={1}>
              {order.customerName || 'Unknown'}
            </Text>
            <Text style={[styles.wProduct, { color: colors.mutedForeground }]} numberOfLines={1}>
              {order.customName || 'Custom order'}
            </Text>
          </View>
          {/* Right: price + outstanding */}
          <View style={styles.wPriceCol}>
            <Text style={[styles.wPrice, { color: colors.foreground }]}>₹{order.price.toFixed(0)}</Text>
            {outstanding > 0 && (
              <Text style={[styles.wOutstanding, { color: '#C06070' }]}>−₹{outstanding.toFixed(0)}</Text>
            )}
          </View>
        </View>

        {/* Action buttons */}
        <View style={styles.wActions}>
          {/* Stop working */}
          <Pressable
            onPress={handleStopWorking}
            hitSlop={8}
            style={[styles.wActionBtn, { backgroundColor: colors.background, borderColor: colors.border, flex: 1 }]}
          >
            <Feather name="x" size={12} color={colors.mutedForeground} />
            <Text style={[styles.wActionLabel, { color: colors.mutedForeground }]}>Stop</Text>
          </Pressable>

          {/* Ready to ship — primary CTA */}
          <Pressable
            onPress={handleReadyToShip}
            hitSlop={8}
            style={[styles.wActionBtn, styles.wShipBtn, { flex: 2 }]}
          >
            <Feather name="send" size={12} color="#fff" />
            <Text style={styles.wShipLabel}>Ready to Ship</Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

// ── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, accent, bg, icon, colors, IconFamily = Feather }: any) {
  return (
    <View style={[styles.statCard, { backgroundColor: bg, borderColor: colors.border }]}>
      <IconFamily name={icon} size={13} color={accent} />
      <Text style={[styles.statValue, { color: accent }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 18,
  },
  headerLeft: { gap: 2 },
  dateLabel: { fontSize: 12, fontFamily: 'Inter_400Regular', letterSpacing: 0.2 },
  title: { fontSize: 30, fontFamily: 'Inter_700Bold', letterSpacing: -0.5 },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },

  // Stats
  statsRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginBottom: 22 },
  statCard: {
    flex: 1,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
  },
  statValue: { fontSize: 19, fontFamily: 'Inter_700Bold' },
  statLabel: { fontSize: 10, fontFamily: 'Inter_500Medium', textAlign: 'center', letterSpacing: 0.3 },

  // Section header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  seeAll: { fontSize: 13, fontFamily: 'Inter_500Medium' },

  // Subdivision headers
  subdivHeader: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  subdivTitle: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1,
  },

  // Idle Centered state
  idleCenteredContainer: {
    alignSelf: 'stretch',
    height: 272, // Matches ScrollView height (272 card height + 12 vertical padding)
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  idleCenteredCard: {
    alignSelf: 'stretch',
    height: 272, // Matches the height of the active WIP card
    backgroundColor: '#F2F2F7', // Lighter gray
    borderStyle: 'dashed',
    borderWidth: 1.5,
    borderColor: '#E8A2B5', // Lighter pink
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  idleCenteredTitle: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    color: '#E8A2B5', // Lighter pink
  },

  // Working cards
  workingScroll: { paddingHorizontal: 16, paddingBottom: 10, paddingTop: 2, gap: 12 },
  workingCard: {
    width: 200,
    height: 272, // Matches the height of the active WIP card
    borderRadius: 18,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  // Square image — width 200, height 200
  wImageWrap: { position: 'relative', width: '100%', height: 160 },
  wImage: { width: '100%', height: 160 },
  wImagePlaceholder: {
    width: '100%',
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Due date badge on image (replaces WIP/LATE badges)
  wDueBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  wDueBadgeText: { fontSize: 10, fontFamily: 'Inter_700Bold', color: '#fff', letterSpacing: 0.3 },
  // Content area
  wContent: { padding: 12, gap: 8 },
  wNamePriceRow: { flexDirection: 'row', alignItems: 'flex-start' },
  wName: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  wProduct: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  wPriceCol: { alignItems: 'flex-end' },
  wPrice: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  wOutstanding: { fontSize: 11, fontFamily: 'Inter_500Medium', marginTop: 2 },
  // Action buttons
  wActions: { flexDirection: 'row', gap: 6, marginTop: 2 },
  wActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: 9,
    borderWidth: 1,
    paddingVertical: 7,
    paddingHorizontal: 8,
  },
  wActionLabel: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  wShipBtn: {
    backgroundColor: '#C06070',
    borderColor: '#C06070',
  },
  wShipLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: '#fff' },

  // Load more
  loadMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 13,
  },
  loadMoreText: { fontSize: 14, fontFamily: 'Inter_500Medium' },

  // Empty state
  empty: { alignItems: 'center', paddingTop: 40, gap: 14, paddingHorizontal: 40 },
  emptyIconBox: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { fontSize: 19, fontFamily: 'Inter_600SemiBold' },
  emptyText: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 20, color: '#8E8E93' },

  // FAB
  fab: {
    position: 'absolute',
    right: 20,
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    ...Platform.select({
      ios: { shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 10 },
      android: { elevation: 8 },
    }),
  },
});
