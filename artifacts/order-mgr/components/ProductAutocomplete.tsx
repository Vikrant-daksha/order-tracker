import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Product } from '@/types';

interface ProductAutocompleteProps {
  value: string;
  onChange: (name: string, product?: Product) => void;
  products: Product[];
  placeholder?: string;
}

export function ProductAutocomplete({ value, onChange, products, placeholder }: ProductAutocompleteProps) {
  const colors = useColors();
  const [focused, setFocused] = useState(false);

  const suggestions = focused && value.length > 0
    ? products.filter(p => p.name.toLowerCase().includes(value.toLowerCase())).slice(0, 5)
    : [];

  return (
    <View>
      <View style={[styles.inputWrap, { backgroundColor: colors.card, borderColor: focused ? colors.primary : colors.border }]}>
        <Feather name="package" size={16} color={colors.mutedForeground} />
        <TextInput
          value={value}
          onChangeText={t => onChange(t)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder={placeholder || 'Product name...'}
          placeholderTextColor={colors.mutedForeground}
          style={[styles.input, { color: colors.foreground }]}
        />
      </View>
      {suggestions.length > 0 && (
        <View style={[styles.dropdown, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {suggestions.map(p => (
            <Pressable
              key={p.id}
              onPress={() => { onChange(p.name, p); setFocused(false); }}
              style={({ pressed }) => [styles.suggestion, pressed && { opacity: 0.7 }]}
            >
              {p.thumbnailPath ? (
                <Image source={{ uri: p.thumbnailPath }} style={styles.suggThumb} contentFit="cover" />
              ) : (
                <View style={[styles.suggThumb, { backgroundColor: colors.accent, borderRadius: 6, alignItems: 'center', justifyContent: 'center' }]}>
                  <Feather name="package" size={12} color="#C06070" />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={[styles.suggName, { color: colors.foreground }]}>{p.name}</Text>
                {p.defaultPrice ? <Text style={[styles.suggPrice, { color: colors.mutedForeground }]}>${p.defaultPrice}</Text> : null}
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  input: { flex: 1, fontSize: 15, fontFamily: 'Inter_400Regular' },
  dropdown: {
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 4,
    overflow: 'hidden',
  },
  suggestion: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
  suggThumb: { width: 36, height: 36, borderRadius: 6 },
  suggName: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  suggPrice: { fontSize: 12, fontFamily: 'Inter_400Regular' },
});
