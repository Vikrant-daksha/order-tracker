import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import * as Linking from "expo-linking";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { ImageViewer } from "@/components/ImageViewer";
import {
  Alert,
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PaymentPill, StatusPill } from "@/components/StatusPill";
import { OrderDetailsCard } from "@/components/orderDetails";
import { useColors } from "@/hooks/useColors";
import { useDatabase } from "@/context/DatabaseContext";
import {
  cancelOrderReminder,
  scheduleOrderReminder,
} from "@/utils/notifications";

const SOURCE_ICONS: Record<string, string> = {
  Instagram: "instagram",
  Facebook: "facebook",
  WhatsApp: "message-circle",
  Website: "globe",
  Email: "mail",
  Manual: "edit-3",
};

function buildMessage(order: any): string {
  const lines: string[] = [
    `Hi ${order.customerName}!`,
    `Your order "${order.customName || "item"}" has been ${order.status.toLowerCase()}.`,
  ];
  if (order.trackingLink)
    lines.push(`Track your package: ${order.trackingLink}`);
  lines.push("Thank you for your order!");
  return lines.join("\n");
}

function formatWhatsAppNumber(phone: string): string {
  let p = phone.replace(/[^0-9+]/g, "");
  if (!p.startsWith("+") && !p.startsWith("91")) {
    p = "91" + p;
  }
  return p;
}

const { width: screenWidth } = Dimensions.get("window");
const CAROUSEL_WIDTH = screenWidth - 32;

export default function OrderDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getOrder, deleteOrder, updateOrder, customers } = useDatabase();
  const order = getOrder(id);
  const [activeViewerImage, setActiveViewerImage] = useState<string | null>(
    null,
  );
  const [selectedItemIndex, setSelectedItemIndex] = useState(0);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [galleryTab, setGalleryTab] = useState<"product" | "size">("product");
  const carouselRef = React.useRef<ScrollView>(null);
  const mainScrollRef = React.useRef<ScrollView>(null);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  if (!order) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: topPad + 8 }]}>
          <Pressable onPress={() => router.back()}>
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </Pressable>
        </View>
        <View style={styles.notFound}>
          <Text
            style={[styles.notFoundText, { color: colors.mutedForeground }]}
          >
            Order not found
          </Text>
        </View>
      </View>
    );
  }

  const activeOrder = order;
  const customer = React.useMemo(() => {
    if (!order) return null;
    return (
      (order.customerId
        ? customers.find((c) => c.id === order.customerId)
        : null) ||
      customers.find(
        (c) => c.name.toLowerCase() === order.customerName.toLowerCase(),
      ) ||
      null
    );
  }, [order, customers]);

  const outstanding = activeOrder.price - activeOrder.amountPaid;
  const message = buildMessage(activeOrder);
  const [ig, phone, email] = (activeOrder.contactInfo || "").split("\n");

  const selectedItem =
    activeOrder.items && activeOrder.items.length > 0
      ? activeOrder.items[selectedItemIndex]
      : null;

  const productImages = React.useMemo(() => {
    if (selectedItem) {
      if (selectedItem.imagePaths && selectedItem.imagePaths.length > 0) {
        return selectedItem.imagePaths;
      }
      if (selectedItem.imagePath) {
        return [selectedItem.imagePath];
      }
      return [];
    }
    return activeOrder.referenceImagePath
      ? [activeOrder.referenceImagePath]
      : [];
  }, [selectedItem, activeOrder.referenceImagePath]);

  const sizeImages = React.useMemo(() => {
    if (selectedItem) {
      if (
        selectedItem.sizeImagePaths &&
        selectedItem.sizeImagePaths.length > 0
      ) {
        return selectedItem.sizeImagePaths;
      }
      if (selectedItem.sizeImagePath) {
        return [selectedItem.sizeImagePath];
      }
    }
    if (activeOrder.sizeImagePaths && activeOrder.sizeImagePaths.length > 0) {
      return activeOrder.sizeImagePaths;
    }
    if (activeOrder.sizeImagePath) {
      return [activeOrder.sizeImagePath];
    }
    if (customer?.sizeImagePaths && customer.sizeImagePaths.length > 0) {
      return customer.sizeImagePaths;
    }
    if (customer?.sizeImagePath) {
      return [customer.sizeImagePath];
    }
    return [];
  }, [
    selectedItem,
    activeOrder.sizeImagePaths,
    activeOrder.sizeImagePath,
    customer,
  ]);

  const hasProductImages = productImages.length > 0;
  const hasSizeImages = sizeImages.length > 0;

  const effectiveTab =
    (galleryTab === "size" && hasSizeImages) ||
    (!hasProductImages && hasSizeImages)
      ? "size"
      : "product";

  const currentGalleryImages =
    effectiveTab === "size" ? sizeImages : productImages;
  const isViewingSize = effectiveTab === "size";

  React.useEffect(() => {
    setActiveImageIndex(0);
    carouselRef.current?.scrollTo({ x: 0, animated: false });
  }, [selectedItemIndex, effectiveTab]);

  function handleSend() {
    const source = activeOrder.source;
    if (source === "WhatsApp") {
      const p = formatWhatsAppNumber(activeOrder.contactInfo || "");
      const url = `https://wa.me/${p}?text=${encodeURIComponent(message)}`;
      Linking.openURL(url);
    } else if (source === "Email") {
      const subject = encodeURIComponent(
        `Order Update - ${activeOrder.customName || "Your Order"}`,
      );
      const body = encodeURIComponent(message);
      const email = activeOrder.contactInfo || "";
      Linking.openURL(`mailto:${email}?subject=${subject}&body=${body}`);
    } else {
      Clipboard.setStringAsync(message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        "Message Copied",
        `The message has been copied. Open ${source} to paste and send it to ${activeOrder.contactInfo || "the customer"}.`,
        [
          { text: "OK" },
          source === "Instagram"
            ? {
                text: "Open Instagram",
                onPress: () => Linking.openURL("instagram://"),
              }
            : {
                text: "Open Facebook",
                onPress: () => Linking.openURL("fb://"),
              },
        ],
      );
    }
  }

  function handleTrackingLink() {
    if (activeOrder.trackingLink) {
      const url = activeOrder.trackingLink.startsWith("http")
        ? activeOrder.trackingLink
        : `https://${activeOrder.trackingLink}`;
      Linking.openURL(url);
    }
  }

  async function handleAdvanceStatus() {
    const next: Record<string, string> = {
      Confirmed: "Completed",
      Completed: "Shipped",
      Shipped: "Delivered",
    };
    const nextStatus = next[activeOrder.status];
    if (!nextStatus) return;
    await updateOrder(activeOrder.id, { status: nextStatus as any });
    if (nextStatus === "Delivered") {
      await cancelOrderReminder(activeOrder.id);
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  async function handleRevertStatus() {
    const prev: Record<string, string> = {
      Delivered: "Shipped",
      Shipped: "Completed",
      Completed: "Confirmed",
    };
    const prevStatus = prev[activeOrder.status];
    if (!prevStatus) return;
    await updateOrder(activeOrder.id, { status: prevStatus as any });
    if (activeOrder.status === "Delivered" && activeOrder.dueDate) {
      await scheduleOrderReminder(
        activeOrder.id,
        activeOrder.customerName,
        activeOrder.customName,
        activeOrder.dueDate,
      );
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  function confirmDelete() {
    Alert.alert("Delete Order", "This order will be permanently deleted.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          await cancelOrderReminder(activeOrder.id);
          await deleteOrder(activeOrder.id);
          router.back();
        },
      },
    ]);
  }

  const STATUSES = ["Confirmed", "Completed", "Shipped", "Delivered"];
  const statusIndex = STATUSES.indexOf(order.status);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          { paddingTop: topPad + 8, borderBottomColor: colors.border },
        ]}
      >
        <Pressable onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <View style={styles.headerMid}>
          <Text style={[styles.orderId, { color: colors.mutedForeground }]}>
            #{order.id.slice(-6).toUpperCase()}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() =>
              router.push({
                pathname: "/order/new",
                params: { id: order.id },
              } as any)
            }
          >
            <Feather name="edit-2" size={20} color={colors.mutedForeground} />
          </Pressable>
          <Pressable onPress={confirmDelete}>
            <Feather name="trash-2" size={20} color={colors.destructive} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        ref={mainScrollRef}
        contentContainerStyle={{
          padding: 16,
          paddingBottom: Platform.OS === "web" ? 60 : insets.bottom + 30,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Cover Images Carousel — tap to open full-screen viewer */}
        {currentGalleryImages.length > 0 ? (
          <View style={{ marginBottom: 16 }}>
            {/* Gallery Type Segmented Switcher when both product and size photos exist */}
            {hasProductImages && hasSizeImages && (
              <View
                style={[
                  styles.galleryTabContainer,
                  { backgroundColor: colors.muted, borderColor: colors.border },
                ]}
              >
                <Pressable
                  onPress={() => {
                    setGalleryTab("product");
                    setActiveImageIndex(0);
                    carouselRef.current?.scrollTo({ x: 0, animated: false });
                  }}
                  style={[
                    styles.galleryTabButton,
                    effectiveTab === "product" && [
                      styles.galleryTabButtonActive,
                      { backgroundColor: colors.card },
                    ],
                  ]}
                >
                  <Feather
                    name="image"
                    size={13}
                    color={
                      effectiveTab === "product"
                        ? "#C06070"
                        : colors.mutedForeground
                    }
                  />
                  <Text
                    style={[
                      styles.galleryTabText,
                      {
                        color:
                          effectiveTab === "product"
                            ? colors.foreground
                            : colors.mutedForeground,
                      },
                      effectiveTab === "product" && styles.galleryTabTextActive,
                    ]}
                  >
                    Product
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    setGalleryTab("size");
                    setActiveImageIndex(0);
                    carouselRef.current?.scrollTo({ x: 0, animated: false });
                  }}
                  style={[
                    styles.galleryTabButton,
                    effectiveTab === "size" && [
                      styles.galleryTabButtonActive,
                      { backgroundColor: colors.card },
                    ],
                  ]}
                >
                  <Feather
                    name="maximize-2"
                    size={13}
                    color={
                      effectiveTab === "size"
                        ? "#C06070"
                        : colors.mutedForeground
                    }
                  />
                  <Text
                    style={[
                      styles.galleryTabText,
                      {
                        color:
                          effectiveTab === "size"
                            ? colors.foreground
                            : colors.mutedForeground,
                      },
                      effectiveTab === "size" && styles.galleryTabTextActive,
                    ]}
                  >
                    Custom Size
                  </Text>
                </Pressable>
              </View>
            )}

            {/* If only custom size photos exist (no product photos), show a subtle header chip */}
            {!hasProductImages && hasSizeImages && (
              <View
                style={[
                  styles.singleTypeHeaderBadge,
                  {
                    backgroundColor: colors.accent,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Feather name="maximize-2" size={13} color="#C06070" />
                <Text
                  style={[styles.singleTypeHeaderText, { color: "#8B4D5C" }]}
                >
                  Custom Size Photos ({sizeImages.length})
                </Text>
              </View>
            )}

            <ScrollView
              ref={carouselRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={(e) => {
                const x = e.nativeEvent.contentOffset.x;
                const index = Math.round(x / CAROUSEL_WIDTH);
                setActiveImageIndex(index);
              }}
              scrollEventThrottle={16}
              style={{
                width: CAROUSEL_WIDTH,
                height: CAROUSEL_WIDTH,
                borderRadius: colors.radius + 4,
                overflow: "hidden",
              }}
            >
              {currentGalleryImages.map((img, i) => (
                <Pressable
                  key={`${effectiveTab}-${i}`}
                  onPress={() => setActiveViewerImage(img)}
                  style={{ width: CAROUSEL_WIDTH, height: CAROUSEL_WIDTH }}
                >
                  <Image
                    source={{ uri: img }}
                    style={{ width: "100%", height: "100%" }}
                    contentFit="cover"
                  />
                  {/* Top-left image type badge */}
                  <View style={styles.imageTypeBadgeOverlay}>
                    <View
                      style={[
                        styles.imageTypeBadge,
                        {
                          backgroundColor: isViewingSize
                            ? "rgba(192, 96, 112, 0.9)"
                            : "rgba(0, 0, 0, 0.55)",
                        },
                      ]}
                    >
                      <Feather
                        name={isViewingSize ? "maximize-2" : "image"}
                        size={11}
                        color="#fff"
                      />
                      <Text style={styles.imageTypeBadgeText}>
                        {isViewingSize
                          ? `Size Photo ${i + 1}/${currentGalleryImages.length}`
                          : `Product Photo ${i + 1}/${currentGalleryImages.length}`}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.zoomHintOverlay}>
                    <View style={styles.zoomHintBadge}>
                      <Feather name="zoom-in" size={13} color="#fff" />
                      <Text style={styles.zoomHintText}>
                        Tap to view ({i + 1}/{currentGalleryImages.length})
                      </Text>
                    </View>
                  </View>
                </Pressable>
              ))}
            </ScrollView>

            {currentGalleryImages.length > 1 && (
              <View style={styles.dotContainer}>
                {currentGalleryImages.map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.dot,
                      {
                        backgroundColor:
                          i === activeImageIndex ? "#C06070" : colors.border,
                      },
                    ]}
                  />
                ))}
              </View>
            )}

            {/* Thumbnail selector row for quick jump */}
            {currentGalleryImages.length > 1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.thumbnailStrip}
              >
                {currentGalleryImages.map((thumb, idx) => {
                  const isThumbActive = idx === activeImageIndex;
                  return (
                    <Pressable
                      key={idx}
                      onPress={() => {
                        setActiveImageIndex(idx);
                        carouselRef.current?.scrollTo({
                          x: idx * CAROUSEL_WIDTH,
                          animated: true,
                        });
                      }}
                      style={[
                        styles.thumbItem,
                        {
                          borderColor: isThumbActive
                            ? "#C06070"
                            : colors.border,
                        },
                        isThumbActive && { borderWidth: 2 },
                      ]}
                    >
                      <Image
                        source={{ uri: thumb }}
                        style={styles.thumbImage}
                        contentFit="cover"
                      />
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </View>
        ) : null}

        {/* Size badge & Custom Size Photos */}

        {selectedItem?.size ||
        activeOrder.size ||
        customer?.size ||
        sizeImages.length > 0 ? (
          <View style={{ marginBottom: 12, gap: 8 }}>
            {selectedItem?.size || activeOrder.size || customer?.size ? (
              <View
                style={[
                  styles.sizeBadgeRow,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    marginBottom: 0,
                  },
                ]}
              >
                <View
                  style={[styles.sizeBadge, { backgroundColor: colors.accent }]}
                >
                  <Feather name="maximize-2" size={12} color="#C06070" />
                  <Text
                    style={[
                      styles.sizeBadgeLabel,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    SIZE
                  </Text>
                  <Text
                    style={[
                      styles.sizeBadgeValue,
                      { color: colors.foreground },
                    ]}
                  >
                    {selectedItem?.size || activeOrder.size || customer?.size}
                  </Text>
                </View>
              </View>
            ) : null}
            {sizeImages.length > 0 ? (
              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    marginBottom: 0,
                    padding: 12,
                    gap: 8,
                  },
                ]}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <Feather name="maximize-2" size={13} color="#C06070" />
                    <Text
                      style={{
                        fontSize: 12,
                        fontFamily: "Inter_600SemiBold",
                        color: colors.foreground,
                      }}
                    >
                      Custom Size Photos ({sizeImages.length})
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => {
                      setGalleryTab("size");
                      setActiveImageIndex(0);
                      carouselRef.current?.scrollTo({ x: 0, animated: false });
                      mainScrollRef.current?.scrollTo({ y: 0, animated: true });
                    }}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                      paddingVertical: 3,
                      paddingHorizontal: 8,
                      borderRadius: 6,
                      backgroundColor: colors.accent,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 10,
                        fontFamily: "Inter_600SemiBold",
                        color: "#C06070",
                      }}
                    >
                      {selectedItem?.size || activeOrder.size || customer?.size}
                    </Text>
                  </Pressable>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8 }}
                >
                  {sizeImages.map((sImg, sIdx) => (
                    <Pressable
                      key={sIdx}
                      onPress={() => {
                        setActiveViewerImage(sImg);
                      }}
                      style={{
                        width: 55,
                        height: 55,
                        borderRadius: 8,
                        overflow: "hidden",
                        borderWidth: 1,
                        borderColor: colors.border,
                      }}
                    >
                      <Image
                        source={{ uri: sImg }}
                        style={{ width: "100%", height: "100%" }}
                        contentFit="cover"
                      />
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            ) : null}
          </View>
        ) : null}

        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>
            Order Products ({order.items?.length || 1})
          </Text>
          <View style={{ gap: 12, marginTop: 2 }}>
            {(order.items && order.items.length > 0
              ? order.items
              : [
                  {
                    id: "legacy-" + order.id,
                    productName: order.customName || "Custom item",
                    price: order.price,
                    quantity: 1,
                    size: order.size,
                    imagePath: order.referenceImagePath,
                    thumbnailPath: order.thumbnailPath,
                    isCustom: !!order.isCustom,
                  },
                ]
            ).map((item, idx) => {
              const isSelected = idx === selectedItemIndex;
              const hasImages =
                (item.imagePaths && item.imagePaths.length > 0) ||
                !!item.imagePath ||
                !!item.thumbnailPath;
              const displayUri =
                item.thumbnailPath ||
                item.imagePath ||
                (item.imagePaths && item.imagePaths[0]);

              return (
                <Pressable
                  key={item.id || idx}
                  onPress={() => {
                    setSelectedItemIndex(idx);
                    setActiveImageIndex(0);
                  }}
                  style={[
                    {
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                      paddingVertical: 6,
                      paddingHorizontal: 8,
                      borderRadius: 10,
                    },
                    isSelected && {
                      backgroundColor: colors.accent,
                      borderWidth: 1,
                      borderColor: "#C06070",
                    },
                  ]}
                >
                  {hasImages ? (
                    <View>
                      <Image
                        source={{ uri: displayUri }}
                        style={{
                          width: 50,
                          height: 50,
                          borderRadius: 8,
                          backgroundColor: colors.accent,
                        }}
                        contentFit="cover"
                      />
                    </View>
                  ) : (
                    <View
                      style={{
                        width: 50,
                        height: 50,
                        borderRadius: 8,
                        backgroundColor: colors.accent,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Feather name="package" size={20} color="#C06070" />
                    </View>
                  )}
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text
                      style={{
                        fontSize: 13,
                        fontFamily: "Inter_600SemiBold",
                        color: colors.foreground,
                      }}
                    >
                      {item.productName}
                    </Text>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 10,
                          fontFamily: "Inter_500Medium",
                          color: colors.mutedForeground,
                        }}
                      >
                        Qty: {item.quantity}
                      </Text>
                      {item.size ? (
                        <View
                          style={[
                            styles.sizeInlineChip,
                            {
                              backgroundColor: isSelected
                                ? "#C06070"
                                : colors.accent,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.sizeInlineText,
                              { color: isSelected ? "#fff" : "#C06070" },
                            ]}
                          >
                            {item.size}
                          </Text>
                        </View>
                      ) : null}
                      {item.isCustom ? (
                        <Text
                          style={{
                            fontSize: 11,
                            fontFamily: "Inter_500Medium",
                            color: "#C06070",
                            backgroundColor: colors.accent,
                            paddingHorizontal: 6,
                            paddingVertical: 1,
                            borderRadius: 4,
                          }}
                        >
                          Custom
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  {item.price != null ? (
                    <Text
                      style={{
                        fontSize: 14,
                        fontFamily: "Inter_600SemiBold",
                        color: colors.foreground,
                      }}
                    >
                      ₹{item.price}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </View>

        {(() => {
          const rawAddress = activeOrder.address || customer?.address || "";
          const addressLines = rawAddress
            ? (rawAddress.includes("\n")
                ? rawAddress.split("\n")
                : rawAddress.split(",")
              )
                .map((s) => s.trim())
                .filter(Boolean)
            : [];

          const mappedItems = (
            activeOrder.items && activeOrder.items.length > 0
              ? activeOrder.items
              : [
                  {
                    id: "legacy-" + activeOrder.id,
                    productName: activeOrder.customName || "Custom item",
                    price: activeOrder.price,
                    quantity: 1,
                    size: activeOrder.size,
                    isCustom: !!activeOrder.isCustom,
                  },
                ]
          ).map((it, idx) => ({
            id: it.id || String(idx),
            quantity: it.quantity || 1,
            name: it.productName || (it as any).name || "Item",
            price: Number(it.price || 0) * (it.quantity || 1),
            size: it.size,
            isCustom: it.isCustom,
          }));

          let reminderText: string | null = null;
          if (activeOrder.dueDate && activeOrder.status !== "Delivered") {
            const due = new Date(`${activeOrder.dueDate}T00:00:00`);
            const reminder = new Date(due);
            reminder.setDate(due.getDate() - 2);
            reminder.setHours(10, 0, 0, 0);
            if (reminder > new Date()) {
              reminderText = `Reminder set for ${formatDate(
                reminder.toISOString().split("T")[0],
              )} at 10:00 AM`;
            }
          }

          return (
            <OrderDetailsCard
              orderId={`#${activeOrder.id}`}
              customerName={activeOrder.customerName}
              channel={activeOrder.source || "Direct"}
              addressLines={addressLines}
              phone={(phone || customer?.phone || "").trim()}
              instagram={(ig || customer?.igHandle || "").trim()}
              email={(email || customer?.email || "").trim()}
              orderDate={formatDate(activeOrder.orderDate)}
              dueDate={formatDate(activeOrder.dueDate)}
              items={mappedItems}
              totalAmount={activeOrder.price}
              paidAmount={activeOrder.amountPaid || 0}
              balanceAmount={outstanding}
              currencySymbol="₹"
              selectedItemIndex={selectedItemIndex}
              onSelectItem={(idx) => {
                setSelectedItemIndex(idx);
                setActiveImageIndex(0);
              }}
              customerNotes={customer?.notes || null}
              statusPill={<StatusPill status={activeOrder.status} />}
              paymentPill={
                <PaymentPill status={activeOrder.paymentStatus} fullWidth />
              }
              reminderText={reminderText}
            />
          );
        })()}

        {/* Status Timeline */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              marginTop: 12,
            },
          ]}
        >
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>
            Status Timeline
          </Text>
          <View style={styles.timeline}>
            {STATUSES.map((s, i) => {
              const done = i <= statusIndex;
              const active = i === statusIndex;
              return (
                <View key={s} style={styles.timelineItem}>
                  <View style={styles.timelineLeft}>
                    <View
                      style={[
                        styles.timelineDot,
                        {
                          backgroundColor: done ? colors.primary : colors.muted,
                          borderColor: active ? "#C06070" : "transparent",
                        },
                      ]}
                    >
                      {done && (
                        <Feather
                          name="check"
                          size={12}
                          color={colors.primaryForeground}
                        />
                      )}
                    </View>
                    {i < STATUSES.length - 1 && (
                      <View
                        style={[
                          styles.timelineLine,
                          {
                            backgroundColor:
                              i < statusIndex ? colors.primary : colors.border,
                          },
                        ]}
                      />
                    )}
                  </View>
                  <Text
                    style={[
                      styles.timelineLabel,
                      {
                        color: done
                          ? colors.foreground
                          : colors.mutedForeground,
                        fontFamily: active
                          ? "Inter_600SemiBold"
                          : "Inter_400Regular",
                      },
                    ]}
                  >
                    {s}
                  </Text>
                </View>
              );
            })}
          </View>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
            {order.status !== "Confirmed" && (
              <Pressable
                onPress={handleRevertStatus}
                style={[
                  styles.advanceBtn,
                  {
                    flex: 1,
                    backgroundColor: colors.card,
                    borderWidth: 1,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Feather
                  name="arrow-left"
                  size={16}
                  color={colors.foreground}
                />
                <Text
                  style={[styles.advanceBtnText, { color: colors.foreground }]}
                  adjustsFontSizeToFit
                  numberOfLines={1}
                >
                  Revert
                </Text>
              </Pressable>
            )}

            {order.status !== "Delivered" && (
              <Pressable
                onPress={handleAdvanceStatus}
                style={[
                  styles.advanceBtn,
                  { flex: 2, backgroundColor: colors.primary },
                ]}
              >
                <Text
                  style={[
                    styles.advanceBtnText,
                    { color: colors.primaryForeground },
                  ]}
                  adjustsFontSizeToFit
                  numberOfLines={1}
                >
                  Mark as{" "}
                  {(
                    {
                      Confirmed: "Completed",
                      Completed: "Shipped",
                      Shipped: "Delivered",
                    } as Record<string, string>
                  )[order.status] ?? ""}
                </Text>
                <Feather
                  name="arrow-right"
                  size={16}
                  color={colors.primaryForeground}
                />
              </Pressable>
            )}
          </View>
        </View>

        {/* Tracking */}
        {order.trackingLink ? (
          <Pressable
            onPress={handleTrackingLink}
            style={[
              styles.card,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
              },
            ]}
          >
            <View
              style={[styles.sourceIcon, { backgroundColor: colors.accent }]}
            >
              <Feather name="truck" size={18} color="#C06070" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>
                Tracking
              </Text>
              <Text
                style={[styles.trackingLink, { color: "#C06070" }]}
                numberOfLines={1}
              >
                {order.trackingLink}
              </Text>
            </View>
            <Feather
              name="external-link"
              size={16}
              color={colors.mutedForeground}
            />
          </Pressable>
        ) : null}

        {/* Notes */}
        {order.notes ? (
          <View
            style={[
              styles.card,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>
              Notes
            </Text>
            <Text style={[styles.notes, { color: colors.mutedForeground }]}>
              {order.notes}
            </Text>
          </View>
        ) : null}

        {/* Action Buttons */}
        <View style={{ flexDirection: "row", gap: 10 }}>
          {ig ? (
            <Pressable
              onPress={async () => {
                const username = ig.replace("@", "").trim();
                const appLink = `https://ig.me/m/${username}`;
                const fallbackLink = `https://instagram.com/${username}`;

                Clipboard.setStringAsync(message);
                Haptics.notificationAsync(
                  Haptics.NotificationFeedbackType.Success,
                );

                try {
                  const supported = await Linking.canOpenURL(appLink);
                  if (supported) {
                    await Linking.openURL(appLink);
                  } else {
                    await Linking.openURL(fallbackLink);
                  }
                } catch {
                  await Linking.openURL(fallbackLink);
                }
              }}
              style={[
                styles.sendBtn,
                {
                  flex: 1,
                  backgroundColor: "#FFFFFF",
                  borderWidth: 1,
                  borderColor: colors.border,
                },
              ]}
            >
              <Feather name="instagram" size={18} color="#C13584" />
              <Text
                style={[styles.sendBtnText, { color: "#C13584", fontSize: 14 }]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                IG
              </Text>
            </Pressable>
          ) : null}

          {phone ? (
            <Pressable
              onPress={() => {
                const p = formatWhatsAppNumber(phone);
                Linking.openURL(
                  `https://wa.me/${p}?text=${encodeURIComponent(message)}`,
                );
              }}
              style={[
                styles.sendBtn,
                {
                  flex: 1,
                  backgroundColor: "#FFFFFF",
                  borderWidth: 1,
                  borderColor: colors.border,
                },
              ]}
            >
              <Feather name="message-circle" size={18} color="#128C7E" />
              <Text
                style={[styles.sendBtnText, { color: "#128C7E", fontSize: 14 }]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                WhatsApp
              </Text>
            </Pressable>
          ) : null}

          {email ? (
            <Pressable
              onPress={() => {
                const subject = encodeURIComponent(
                  `Order Update - ${order.customName || "Your Order"}`,
                );
                const body = encodeURIComponent(message);
                Linking.openURL(
                  `mailto:${email}?subject=${subject}&body=${body}`,
                );
              }}
              style={[
                styles.sendBtn,
                {
                  flex: 1,
                  backgroundColor: "#FFFFFF",
                  borderWidth: 1,
                  borderColor: colors.border,
                },
              ]}
            >
              <Feather name="mail" size={18} color="#000000" />
              <Text
                style={[styles.sendBtnText, { color: "#000000", fontSize: 14 }]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                Email
              </Text>
            </Pressable>
          ) : null}

          {!ig && !phone && !email ? (
            <Pressable
              onPress={handleSend}
              style={[
                styles.sendBtn,
                {
                  flex: 1,
                  backgroundColor: "#FFFFFF",
                  borderWidth: 1,
                  borderColor: colors.border,
                },
              ]}
            >
              <Feather name="send" size={18} color="#000000" />
              <Text
                style={[styles.sendBtnText, { color: "#000000", fontSize: 14 }]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                Copy Message
              </Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
      <ImageViewer
        visible={!!activeViewerImage}
        uri={activeViewerImage || ""}
        onClose={() => setActiveViewerImage(null)}
      />
    </View>
  );
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${months[parseInt(m) - 1]} ${parseInt(d)}, ${y}`;
}

function InfoItem({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: any;
}) {
  return (
    <View style={styles.infoItem}>
      <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>
        {label}
      </Text>
      <Text
        style={[styles.infoValue, { color: colors.foreground }]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerMid: { flex: 1, alignItems: "center" },
  orderId: { fontSize: 13, fontFamily: "Inter_500Medium" },
  headerActions: { flexDirection: "row", gap: 16 },
  heroImageContainer: {
    width: "100%",
    aspectRatio: 1,
    marginBottom: 12,
    overflow: "hidden",
  },
  heroImage: { width: "100%", aspectRatio: 1 },
  zoomHintOverlay: { position: "absolute", bottom: 10, right: 10 },
  zoomHintBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(0,0,0,0.45)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  zoomHintText: { fontSize: 12, fontFamily: "Inter_500Medium", color: "#fff" },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
    gap: 12,
  },
  customerHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  sourceIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  customerName: { fontSize: 18, fontFamily: "Inter_700Bold" },
  contactInfo: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth },
  infoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 16 },
  infoItem: { width: "44%", gap: 3 },
  infoLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  infoValue: { fontSize: 14, fontFamily: "Inter_500Medium" },
  reminderBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  reminderText: { fontSize: 12, fontFamily: "Inter_500Medium", flex: 1 },
  cardTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  paymentRow: { flexDirection: "row" },
  priceLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  priceValue: { fontSize: 18, fontFamily: "Inter_700Bold" },
  timeline: { gap: 0 },
  timelineItem: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  timelineLeft: { alignItems: "center", width: 24 },
  timelineDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  timelineLine: { width: 2, height: 24, marginTop: 2 },
  timelineLabel: { fontSize: 15, paddingTop: 3 },
  advanceBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 12,
  },
  advanceBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  trackingLink: { fontSize: 13, fontFamily: "Inter_400Regular" },
  notes: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  sendBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 14,
    paddingVertical: 14,
  },
  sendBtnText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  notFound: { flex: 1, alignItems: "center", justifyContent: "center" },
  notFoundText: { fontSize: 16, fontFamily: "Inter_400Regular" },
  dotContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  sizeBadgeRow: {
    flexDirection: "row",
    marginBottom: 12,
    borderRadius: 14,
    overflow: "hidden",
  },
  sizeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flex: 1,
  },
  sizeBadgeLabel: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.2,
  },
  sizeBadgeValue: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    flex: 1,
  },
  sizeInlineChip: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  sizeInlineText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.3,
  },
  galleryTabContainer: {
    flexDirection: "row",
    borderRadius: 12,
    borderWidth: 1,
    padding: 3,
    marginBottom: 10,
    gap: 4,
  },
  galleryTabButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 9,
  },
  galleryTabButtonActive: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  galleryTabText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  galleryTabTextActive: {
    fontFamily: "Inter_700Bold",
  },
  singleTypeHeaderBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 10,
    alignSelf: "flex-start",
  },
  singleTypeHeaderText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  imageTypeBadgeOverlay: {
    position: "absolute",
    top: 10,
    left: 10,
  },
  imageTypeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  imageTypeBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  thumbnailStrip: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  thumbItem: {
    width: 48,
    height: 48,
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1,
  },
  thumbImage: {
    width: "100%",
    height: "100%",
  },
});
