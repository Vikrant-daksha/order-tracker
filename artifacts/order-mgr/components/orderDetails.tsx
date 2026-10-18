import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Linking,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
} from "react-native-reanimated";
import { MaterialIcons } from "@expo/vector-icons";
import { PaymentPill } from "./StatusPill";

// ── Design Tokens from Stitch Spec ───────────────────────────────────────────
export const COLORS = {
  background: "#F8F9FF",
  surfaceLowest: "#FFFFFF",
  surfaceLow: "#EFF4FF",
  surfaceContainer: "#E5EEFF",
  surfaceHigh: "#DCE9FF",
  onSurface: "#0B1C30",
  onSurfaceVariant: "#45464D",
  outlineVariant: "#C6C6CD",
  outlineVariantBorder: "rgba(198, 198, 205, 0.6)",
  outlineVariantDivider: "rgba(198, 198, 205, 0.4)",
  primary: "#000000",
  onPrimary: "#FFFFFF",
  secondaryGreen: "#006C4A",
  amberBalance: "#C76C00",
};

export interface OrderItem {
  id: string;
  quantity: number;
  name: string;
  price: number;
  size?: string;
  isCustom?: boolean;
}

// ── NumberGridCell: Decimal & Place-Value Alignment ─────────────────────────
interface NumberGridCellProps {
  amount: number;
  currencySymbol?: string;
  color?: string;
  fontWeight?: "500" | "600" | "700";
}

export const NumberGridCell: React.FC<NumberGridCellProps> = ({
  amount,
  currencySymbol = "₹",
  color = COLORS.onSurface,
  fontWeight = "500",
}) => {
  const [intPart, decPart] = Math.abs(amount).toFixed(2).split(".");

  return (
    <View style={styles.numberGridCell}>
      <Text style={[styles.gridCurrencySymbol, { color, fontWeight }]}>
        {currencySymbol}
      </Text>
      <View style={styles.gridAmountWrapper}>
        <Text style={[styles.gridIntegerText, { color, fontWeight }]}>
          {intPart}
        </Text>
        <Text style={[styles.gridDecimalText, { color, fontWeight }]}>
          .{decPart}
        </Text>
      </View>
    </View>
  );
};

// ── OrderDetailsCard: Reusable Core Card Component ───────────────────────────
export interface OrderDetailsCardProps {
  orderId?: string;
  customerName?: string;
  channel?: string;
  addressLines?: string[];
  phone?: string;
  instagram?: string;
  email?: string;
  orderDate?: string;
  dueDate?: string;
  items?: OrderItem[];
  totalAmount?: number;
  paidAmount?: number;
  balanceAmount?: number;
  currencySymbol?: string;
  selectedItemIndex?: number;
  onSelectItem?: (index: number) => void;
  customerNotes?: string | null;
  statusPill?: React.ReactNode;
  paymentPill?: React.ReactNode;
  reminderText?: string | null;
  showActions?: boolean;
  onSendReceipt?: () => void;
  onRecordPayment?: () => void;
  onShareOrder?: () => void;
}

export const OrderDetailsCard: React.FC<OrderDetailsCardProps> = ({
  orderId,
  customerName = "Customer",
  channel,
  addressLines = [],
  phone = "",
  instagram = "",
  email = "",
  orderDate = "—",
  dueDate = "—",
  items = [],
  totalAmount,
  paidAmount = 0,
  balanceAmount,
  currencySymbol = "₹",
  selectedItemIndex,
  onSelectItem,
  customerNotes,
  statusPill,
  paymentPill,
  reminderText,
  showActions = false,
  onSendReceipt,
  onRecordPayment,
  onShareOrder,
}) => {
  const recordPaymentScale = useSharedValue(1);

  // Financial calculations
  const subtotal =
    totalAmount !== undefined
      ? totalAmount
      : items.reduce((sum, item) => sum + item.price, 0);
  const balanceDue =
    balanceAmount !== undefined
      ? balanceAmount
      : Math.max(0, subtotal - paidAmount);

  const recordBtnAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: recordPaymentScale.value }],
  }));

  const handlePressIn = () => {
    recordPaymentScale.value = withTiming(0.96, { duration: 100 });
  };

  const handlePressOut = () => {
    recordPaymentScale.value = withSpring(1, { damping: 15, stiffness: 200 });
  };

  const handlePhoneCall = () => {
    if (phone) {
      Linking.openURL(`tel:${phone}`);
    }
  };

  const handleInstagram = () => {
    if (instagram) {
      const handle = instagram.replace("@", "");
      Linking.openURL(`https://instagram.com/${handle}`);
    }
  };

  const handleEmail = () => {
    if (email) {
      Linking.openURL(`mailto:${email}`);
    }
  };

  const hasAddress = addressLines && addressLines.length > 0;
  const hasPhone = !!phone;
  const hasInstagram = !!instagram;
  const hasEmail = !!email;

  return (
    <View style={styles.card}>
      {/* ── Section 1: Customer Info & Origin Channel ─────────────────────── */}
      <View style={styles.sectionPadding}>
        <View style={styles.customerHeader}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={styles.sectionLabelSmall}>Customer</Text>
            <Text style={styles.customerName}>
              {customerName || "Customer"}
            </Text>
          </View>

          <View style={styles.headerRightBadges}>
            {channel ? (
              <View style={styles.channelBadge}>
                <MaterialIcons name="tag" size={13} color={COLORS.onSurface} />
                <Text style={styles.channelBadgeText}>{channel}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Address Block */}
        <View style={{ marginTop: 14 }}>
          <Text style={styles.fieldSectionCaption}>ADDRESS</Text>
          <View style={styles.addressBox}>
            {hasAddress ? (
              addressLines.map((line, idx) => (
                <Text
                  key={idx}
                  style={[
                    styles.addressLine,
                    idx === addressLines.length - 1 &&
                      addressLines.length > 2 && {
                        color: COLORS.onSurfaceVariant,
                      },
                  ]}
                  numberOfLines={1}
                >
                  {line}
                </Text>
              ))
            ) : (
              <Text style={styles.emptyText}>No shipping address provided</Text>
            )}
          </View>
        </View>

        {/* Contact Info (Communication Handles) */}
        <View style={{ marginTop: 14 }}>
          <Text style={styles.fieldSectionCaption}>CONTACT INFO</Text>
          <View style={styles.handlesContainer}>
            {/* Row 1: Phone & Instagram handles */}
            {hasPhone || hasInstagram ? (
              <View style={styles.handleRow}>
                <View style={styles.handleInfoGroup}>
                  {hasPhone ? (
                    <TouchableOpacity
                      style={styles.handleInlineItem}
                      onPress={handlePhoneCall}
                    >
                      <MaterialIcons
                        name="call"
                        size={15}
                        color={COLORS.onSurfaceVariant}
                      />
                      <Text style={styles.phoneText}>{phone}</Text>
                    </TouchableOpacity>
                  ) : null}

                  {hasPhone && hasInstagram ? (
                    <View style={styles.verticalDivider} />
                  ) : null}

                  {hasInstagram ? (
                    <TouchableOpacity
                      style={styles.handleInlineItem}
                      onPress={handleInstagram}
                    >
                      <MaterialIcons
                        name="alternate-email"
                        size={14}
                        color={COLORS.onSurfaceVariant}
                      />
                      <Text style={styles.igText}>{instagram}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>

                <View style={styles.handleActionsRow}>
                  {hasInstagram ? (
                    <TouchableOpacity
                      aria-label="Open Instagram"
                      onPress={handleInstagram}
                      style={styles.miniActionButton}
                      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                    >
                      <MaterialIcons
                        name="open-in-new"
                        size={15}
                        color={COLORS.onSurfaceVariant}
                      />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            ) : null}

            {/* Row 2: Email handle */}
            {hasEmail ? (
              <View style={styles.handleRow}>
                <TouchableOpacity
                  style={styles.handleInlineItem}
                  onPress={handleEmail}
                >
                  <MaterialIcons
                    name="mail"
                    size={15}
                    color={COLORS.onSurfaceVariant}
                  />
                  <Text style={styles.emailText}>{email}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  aria-label="Send Email"
                  onPress={handleEmail}
                  style={styles.miniActionButton}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <MaterialIcons
                    name="send"
                    size={15}
                    color={COLORS.onSurfaceVariant}
                  />
                </TouchableOpacity>
              </View>
            ) : null}

            {!hasPhone && !hasInstagram && !hasEmail && (
              <View style={styles.emptyHandleRow}>
                <Text style={styles.emptyItalicText}>
                  No contact details provided
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Customer Notes (if present) */}
        {customerNotes ? (
          <View style={{ marginTop: 14 }}>
            <Text style={styles.fieldSectionCaption}>CUSTOMER NOTES</Text>
            <View style={styles.notesBox}>
              <Text style={styles.notesContent}>{customerNotes}</Text>
            </View>
          </View>
        ) : null}
      </View>

      {/* ── Section 2: Order Dates (Edge-to-Edge Line) ────────────────────── */}
      <View style={styles.datesBar}>
        <View style={styles.dateItem}>
          <MaterialIcons
            name="event"
            size={15}
            color={COLORS.onSurfaceVariant}
          />
          <Text style={styles.datePrefix}>Ordered:</Text>
          <Text style={styles.dateNumericValue}>{orderDate}</Text>
        </View>

        <View style={styles.datesBarDivider} />

        <View style={styles.dateItem}>
          <MaterialIcons
            name="schedule"
            size={15}
            color={COLORS.onSurfaceVariant}
          />
          <Text style={styles.datePrefix}>Due:</Text>
          <Text style={styles.dateNumericValue}>{dueDate}</Text>
        </View>
      </View>

      {reminderText ? null : null}

      {/* ── Section 3: Products & Minimalist Pricing Breakdown ────────────── */}
      <View style={styles.sectionPadding}>
        <Text style={styles.fieldSectionCaption}>ORDER ITEMS</Text>
        <View style={styles.itemsList}>
          {items && items.length > 0 ? (
            items.map((item, index) => {
              const isLast = index === items.length - 1;

              return (
                <TouchableOpacity
                  key={item.id || index}
                  activeOpacity={onSelectItem ? 0.7 : 1}
                  onPress={() => onSelectItem && onSelectItem(index)}
                  style={[
                    styles.orderItemRow,
                    !isLast && styles.orderItemBorder,
                  ]}
                >
                  <View style={styles.orderItemLeft}>
                    <Text style={styles.itemQty}>{item.quantity}×</Text>
                    <Text style={styles.itemName} numberOfLines={1}>
                      {item.name}
                    </Text>
                  </View>
                  <NumberGridCell
                    amount={item.price}
                    currencySymbol={currencySymbol}
                    color={COLORS.onSurface}
                    fontWeight="500"
                  />
                </TouchableOpacity>
              );
            })
          ) : (
            <View style={{ paddingVertical: 8 }}>
              <Text style={styles.emptyItalicText}>
                No items added to this order
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* ── Section 4: Payment Summary ────────────────────────────────────── */}
      <View style={styles.paymentSummarySection}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Order Total</Text>
          <NumberGridCell
            amount={subtotal}
            currencySymbol={currencySymbol}
            color={COLORS.onSurface}
            fontWeight="600"
          />
        </View>

        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Paid</Text>
          <NumberGridCell
            amount={paidAmount}
            currencySymbol={currencySymbol}
            color={COLORS.secondaryGreen}
            fontWeight="600"
          />
        </View>

        <View style={styles.balanceDueRow}>
          <Text style={styles.balanceDueLabel}>Balance Due</Text>
          <NumberGridCell
            amount={balanceDue}
            currencySymbol={currencySymbol}
            color={COLORS.amberBalance}
            fontWeight="700"
          />
        </View>

        {paymentPill ? (
          <View style={styles.bottomPaymentPillContainer}>{paymentPill}</View>
        ) : null}
      </View>

      {/* ── Section 5: Quick Action Row (Optional) ────────────────────────── */}
      {showActions && (
        <View style={styles.actionRowContainer}>
          <TouchableOpacity
            style={styles.actionButtonSecondary}
            activeOpacity={0.8}
            onPress={onSendReceipt}
          >
            <MaterialIcons
              name="receipt-long"
              size={18}
              color={COLORS.onSurface}
              style={{ marginBottom: 2 }}
            />
            <Text style={styles.actionButtonSecondaryText}>Send Receipt</Text>
          </TouchableOpacity>

          <Animated.View style={[{ flex: 1 }, recordBtnAnimatedStyle]}>
            <TouchableOpacity
              style={styles.actionButtonPrimary}
              activeOpacity={1}
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
              onPress={onRecordPayment}
            >
              <MaterialIcons
                name="payments"
                size={18}
                color={COLORS.onPrimary}
                style={{ marginBottom: 2 }}
              />
              <Text style={styles.actionButtonPrimaryText}>Record Payment</Text>
            </TouchableOpacity>
          </Animated.View>

          <TouchableOpacity
            style={styles.actionButtonSecondary}
            activeOpacity={0.8}
            onPress={onShareOrder}
          >
            <MaterialIcons
              name="share"
              size={18}
              color={COLORS.onSurface}
              style={{ marginBottom: 2 }}
            />
            <Text style={styles.actionButtonSecondaryText}>Share Order</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

// ── OrderDetailsScreen: Full Screen Wrapper for Standalone Views ─────────────
export interface OrderDetailsScreenProps extends OrderDetailsCardProps {
  hideHeader?: boolean;
  onBack?: () => void;
}

export const OrderDetailsScreen: React.FC<OrderDetailsScreenProps> = ({
  hideHeader = false,
  onBack,
  ...cardProps
}) => {
  const ContainerComponent = hideHeader ? View : SafeAreaView;

  return (
    <ContainerComponent style={styles.safeArea}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor={COLORS.surfaceLowest}
      />

      {/* Top App Bar (Header) */}
      {!hideHeader && (
        <View style={styles.appBar}>
          <View style={styles.appBarLeft}>
            <TouchableOpacity
              aria-label="Go back"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              onPress={onBack}
              style={styles.iconButton}
            >
              <MaterialIcons
                name="arrow-back"
                size={20}
                color={COLORS.onSurface}
              />
            </TouchableOpacity>
            <View style={styles.titleRow}>
              <Text style={styles.appBarTitle}>Order Details</Text>
              {cardProps.orderId ? (
                <View style={styles.orderBadge}>
                  <Text style={styles.orderBadgeText}>{cardProps.orderId}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>
      )}

      {/* Scrollable Body */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <OrderDetailsCard {...cardProps} />
      </ScrollView>
    </ContainerComponent>
  );
};

// ── StyleSheet ───────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  appBar: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    backgroundColor: COLORS.surfaceLowest,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.outlineVariant,
  },
  appBarLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  appBarTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.onSurface,
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  orderBadge: {
    backgroundColor: COLORS.surfaceHigh,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  orderBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.onSurface,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    letterSpacing: 0.4,
  },
  appBarRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  iconButton: {
    padding: 6,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: COLORS.surfaceLowest,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  sectionPadding: {
    padding: 12,
  },
  customerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  headerRightBadges: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sectionLabelSmall: {
    fontSize: 12,
    fontWeight: "500",
    color: COLORS.onSurfaceVariant,
  },
  customerName: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.onSurface,
    letterSpacing: -0.3,
    marginTop: 2,
  },
  channelBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: COLORS.surfaceLow,
    borderWidth: 1,
    borderColor: COLORS.outlineVariantBorder,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 16,
  },
  channelBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.onSurface,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    letterSpacing: 0.4,
  },
  fieldSectionCaption: {
    fontSize: 10,
    fontWeight: "600",
    color: COLORS.onSurfaceVariant,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  addressBox: {
    backgroundColor: COLORS.surfaceLow,
    borderWidth: 1,
    borderColor: COLORS.outlineVariantBorder,
    borderRadius: 4,
    padding: 8,
    gap: 2,
  },
  addressLine: {
    fontSize: 13,
    color: COLORS.onSurface,
    lineHeight: 18,
  },
  emptyText: {
    fontSize: 13,
    fontStyle: "italic",
    color: COLORS.onSurfaceVariant,
  },
  handlesContainer: {
    backgroundColor: COLORS.surfaceLow,
    borderWidth: 1,
    borderColor: COLORS.outlineVariantBorder,
    borderRadius: 4,
    overflow: "hidden",
  },
  handleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.outlineVariantDivider,
  },
  emptyHandleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.outlineVariantDivider,
    borderStyle: "dashed",
  },
  handleInfoGroup: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    flex: 1,
  },
  handleInlineItem: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: "auto",
    gap: 5,
  },
  phoneText: {
    fontSize: 12,
    fontWeight: "500",
    color: COLORS.onSurface,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  verticalDivider: {
    width: 1,
    height: 12,
    backgroundColor: COLORS.outlineVariant,
  },
  igText: {
    fontSize: 12,
    color: COLORS.onSurface,
  },
  handleActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  miniActionButton: {
    padding: 3,
    borderRadius: 4,
  },
  emailText: {
    fontSize: 12,
    color: COLORS.onSurface,
  },
  emptyItalicText: {
    fontSize: 12,
    fontStyle: "italic",
    color: COLORS.outlineVariant,
  },
  notesBox: {
    backgroundColor: COLORS.surfaceLow,
    borderWidth: 1,
    borderColor: COLORS.outlineVariantBorder,
    borderRadius: 4,
    padding: 8,
  },
  notesContent: {
    fontSize: 12,
    color: COLORS.onSurface,
    lineHeight: 16,
  },
  datesBar: {
    backgroundColor: COLORS.surfaceLow,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.outlineVariantDivider,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 2,
  },
  dateItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  datePrefix: {
    fontSize: 12,
    color: COLORS.onSurfaceVariant,
  },
  dateNumericValue: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.onSurface,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  datesBarDivider: {
    width: 1,
    height: 12,
    backgroundColor: COLORS.outlineVariant,
  },
  reminderBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FDF2F4",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(192, 96, 112, 0.15)",
  },
  reminderBarText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#8B4D5C",
    flex: 1,
  },
  itemsList: {
    gap: 6,
  },
  orderItemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  orderItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceContainer,
  },
  orderItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
    marginRight: 8,
  },
  itemQty: {
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.onSurfaceVariant,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  itemName: {
    fontSize: 13,
    fontWeight: "500",
    color: COLORS.onSurface,
  },
  sizeInlineBadge: {
    backgroundColor: COLORS.surfaceHigh,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  sizeInlineBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: COLORS.onSurface,
  },
  customInlineBadge: {
    backgroundColor: "#FCE7F3",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  customInlineBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#BE185D",
  },
  numberGridCell: {
    width: 76,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  gridCurrencySymbol: {
    fontSize: 13,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    fontVariant: ["tabular-nums"],
  },
  gridAmountWrapper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  gridIntegerText: {
    fontSize: 13,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    fontVariant: ["tabular-nums"],
    textAlign: "right",
    minWidth: 28,
  },
  gridDecimalText: {
    fontSize: 13,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    fontVariant: ["tabular-nums"],
    width: 24,
    textAlign: "left",
  },
  paymentSummarySection: {
    backgroundColor: COLORS.surfaceLow,
    padding: 12,
    gap: 6,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  summaryLabel: {
    fontSize: 13,
    color: COLORS.onSurfaceVariant,
  },
  balanceDueRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: COLORS.outlineVariantDivider,
  },
  bottomPaymentPillContainer: {
    marginHorizontal: -12,
    marginBottom: -12,
    marginTop: 10,
    alignSelf: "stretch",
    alignItems: "stretch",
    borderTopWidth: 1,
    borderTopColor: COLORS.outlineVariantDivider,
    overflow: "hidden",
  },
  balanceDueLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.onSurface,
  },
  actionRowContainer: {
    backgroundColor: COLORS.surfaceLowest,
    padding: 12,
    flexDirection: "row",
    gap: 8,
  },
  actionButtonSecondary: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.surfaceLowest,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    borderRadius: 4,
    paddingVertical: 8,
  },
  actionButtonSecondaryText: {
    fontSize: 11,
    fontWeight: "500",
    color: COLORS.onSurface,
  },
  actionButtonPrimary: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.primary,
    borderRadius: 4,
    paddingVertical: 8,
  },
  actionButtonPrimaryText: {
    fontSize: 11,
    fontWeight: "500",
    color: COLORS.onPrimary,
  },
});

export default OrderDetailsScreen;
