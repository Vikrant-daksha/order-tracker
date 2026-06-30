import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { OrderStatus, PaymentStatus } from '@/types';

interface StatusPillProps {
  status: OrderStatus;
  size?: 'sm' | 'md';
}

export function StatusPill({ status, size = 'md' }: StatusPillProps) {
  const colors = useColors();

  const config = {
    Confirmed: { bg: colors.confirmed, text: colors.confirmedText },
    Shipped: { bg: colors.shipped, text: colors.shippedText },
    Delivered: { bg: colors.delivered, text: colors.deliveredText },
  };

  const { bg, text } = config[status];
  const isSmall = size === 'sm';

  return (
    <View style={[styles.pill, { backgroundColor: bg, paddingHorizontal: isSmall ? 8 : 12, paddingVertical: isSmall ? 3 : 5 }]}>
      <Text style={[styles.text, { color: text, fontSize: isSmall ? 10 : 12 }]}>
        {status.toUpperCase()}
      </Text>
    </View>
  );
}

interface PaymentPillProps {
  status: PaymentStatus;
  size?: 'sm' | 'md';
}

export function PaymentPill({ status, size = 'md' }: PaymentPillProps) {
  const colors = useColors();

  const config = {
    Unpaid: { bg: colors.unpaid, text: colors.unpaidText },
    Partial: { bg: colors.partial, text: colors.partialText },
    Paid: { bg: colors.paid, text: colors.paidText },
  };

  const { bg, text } = config[status];
  const isSmall = size === 'sm';

  return (
    <View style={[styles.pill, { backgroundColor: bg, paddingHorizontal: isSmall ? 8 : 12, paddingVertical: isSmall ? 3 : 5 }]}>
      <Text style={[styles.text, { color: text, fontSize: isSmall ? 10 : 12 }]}>
        {status.toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: 100,
    alignSelf: 'flex-start',
  },
  text: {
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.4,
  },
});
