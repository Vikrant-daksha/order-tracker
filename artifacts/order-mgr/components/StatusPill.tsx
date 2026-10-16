import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { OrderStatus, PaymentStatus } from "@/types";

export interface StatusConfigItem {
  bg: string;
  text: string;
  label: string;
  icon: (color: string, size: number) => React.ReactNode;
}

export const ORDER_STATUS_CONFIG: Record<string, StatusConfigItem> = {
  Confirmed: {
    bg: "#E0F2FE",
    text: "#0284C7",
    label: "Confirmed",
    icon: (color, size) => <Feather name="clock" size={size} color={color} />,
  },
  Completed: {
    bg: "#E6F4EA",
    text: "#137333",
    label: "Completed",
    icon: (color, size) => (
      <Ionicons name="checkmark-circle" size={size + 1} color={color} />
    ),
  },
  Shipped: {
    bg: "#EDE9FE",
    text: "#6D28D9",
    label: "Shipped",
    icon: (color, size) => <Feather name="truck" size={size} color={color} />,
  },
  Delivered: {
    bg: "#FEF3C7",
    text: "#B45309",
    label: "Delivered",
    icon: (color, size) => <Feather name="package" size={size} color={color} />,
  },
};

export function getStatusConfig(status?: string): StatusConfigItem {
  if (!status) return ORDER_STATUS_CONFIG.Confirmed;
  const normalized =
    status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
  return ORDER_STATUS_CONFIG[normalized] || ORDER_STATUS_CONFIG.Confirmed;
}

interface StatusPillProps {
  status: OrderStatus | string;
  size?: "sm" | "md";
  showIcon?: boolean;
}

export function StatusPill({
  status,
  size = "md",
  showIcon = true,
}: StatusPillProps) {
  const item = getStatusConfig(status);
  const isSmall = size === "sm";
  const iconSize = isSmall ? 12 : 14;

  return (
    <View
      style={[
        styles.pill,
        styles.statusPillRow,
        {
          backgroundColor: item.bg,
          paddingHorizontal: isSmall ? 8 : 11,
          paddingVertical: isSmall ? 3 : 5,
        },
      ]}
    >
      {showIcon && item.icon(item.text, iconSize)}
      <Text
        style={[
          styles.text,
          {
            color: item.text,
            fontSize: isSmall ? 9 : 10,
            marginLeft: showIcon ? 4 : 0,
          },
        ]}
      >
        {item.label}
      </Text>
    </View>
  );
}

interface PaymentPillProps {
  status: PaymentStatus;
  size?: "sm" | "md";
}

export function PaymentPill({ status, size = "md" }: PaymentPillProps) {
  const colors = useColors();

  const config = {
    Unpaid: { bg: colors.unpaid, text: colors.unpaidText },
    Partial: { bg: colors.partial, text: colors.partialText },
    Paid: { bg: colors.paid, text: colors.paidText },
  };

  const { bg, text } = config[status];
  const isSmall = size === "sm";

  return (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: bg,
          paddingHorizontal: isSmall ? 8 : 12,
          paddingVertical: isSmall ? 3 : 5,
        },
      ]}
    >
      <Text style={[styles.text, { color: text, fontSize: isSmall ? 10 : 12 }]}>
        {status.toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: 4,
    alignSelf: "flex-start",
  },
  statusPillRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  text: {
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.3,
  },
});
