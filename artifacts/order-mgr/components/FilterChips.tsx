import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { useColors } from '@/hooks/useColors';

interface FilterChipsProps<T extends string> {
  options: T[];
  selected: T;
  onSelect: (val: T) => void;
  style?: object;
}

export function FilterChips<T extends string>({ options, selected, onSelect, style }: FilterChipsProps<T>) {
  const colors = useColors();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.container, style]}
    >
      {options.map(opt => {
        const active = opt === selected;
        return (
          <Pressable
            key={opt}
            onPress={() => onSelect(opt)}
            style={[
              styles.chip,
              {
                backgroundColor: active ? colors.primary : colors.card,
                borderColor: active ? colors.primary : colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.label,
                { color: active ? colors.primaryForeground : colors.mutedForeground },
              ]}
            >
              {opt}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, gap: 8, paddingVertical: 4 },
  chip: {
    borderRadius: 100,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
  },
  label: { fontSize: 13, fontFamily: 'Inter_500Medium' },
});
