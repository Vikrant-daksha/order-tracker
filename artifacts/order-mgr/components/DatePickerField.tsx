import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Feather } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

interface DatePickerFieldProps {
  label: string;
  value: string;
  onChange: (date: string) => void;
  placeholder?: string;
  minDate?: Date;
}

function formatDisplay(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[parseInt(m) - 1]} ${parseInt(d)}, ${y}`;
}

function toDate(iso: string): Date {
  if (!iso) return new Date();
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function DatePickerField({ label, value, onChange, placeholder, minDate }: DatePickerFieldProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [show, setShow] = useState(false);
  const [tempDate, setTempDate] = useState<Date>(value ? toDate(value) : new Date());

  if (Platform.OS === 'web') {
    return (
      <View style={{ gap: 6 }}>
        <Text style={[styles.label, { color: colors.mutedForeground }]}>{label}</Text>
        <View style={[styles.trigger, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="calendar" size={16} color={value ? '#C06070' : colors.mutedForeground} />
          <TextInput
            value={value}
            onChangeText={onChange}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.mutedForeground}
            // @ts-ignore — type="date" is valid in React Native Web
            type="date"
            style={[styles.webDateInput, { color: colors.foreground }]}
          />
          {value ? (
            <Pressable onPress={() => onChange('')} hitSlop={12}>
              <Feather name="x" size={14} color={colors.mutedForeground} />
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }

  function handleOpen() {
    setTempDate(value ? toDate(value) : new Date());
    setShow(true);
  }

  function handleChange(event: DateTimePickerEvent, date?: Date) {
    if (Platform.OS === 'android') {
      setShow(false);
      if (event.type === 'set' && date) {
        onChange(toISO(date));
      }
    } else {
      if (date) setTempDate(date);
    }
  }

  function handleConfirm() {
    onChange(toISO(tempDate));
    setShow(false);
  }

  function handleClear() {
    onChange('');
    setShow(false);
  }

  return (
    <View style={{ gap: 6 }}>
      <Text style={[styles.label, { color: colors.mutedForeground }]}>{label}</Text>
      <Pressable
        onPress={handleOpen}
        style={[styles.trigger, { backgroundColor: colors.card, borderColor: value ? colors.border : colors.border }]}
      >
        <Feather name="calendar" size={16} color={value ? '#C06070' : colors.mutedForeground} />
        <Text style={[styles.triggerText, { color: value ? colors.foreground : colors.mutedForeground }]}>
          {value ? formatDisplay(value) : (placeholder || 'Select date')}
        </Text>
        {value ? (
          <Pressable onPress={() => onChange('')} hitSlop={12}>
            <Feather name="x" size={14} color={colors.mutedForeground} />
          </Pressable>
        ) : (
          <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
        )}
      </Pressable>

      {/* Android: native dialog, just show inline */}
      {show && Platform.OS === 'android' && (
        <DateTimePicker
          value={tempDate}
          mode="date"
          display="default"
          onChange={handleChange}
          minimumDate={minDate}
        />
      )}

      {/* iOS: sheet modal with inline calendar */}
      {Platform.OS === 'ios' && (
        <Modal visible={show} transparent animationType="slide" onRequestClose={() => setShow(false)}>
          <Pressable style={styles.backdrop} onPress={() => setShow(false)} />
          <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
            <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
              <Pressable onPress={handleClear}>
                <Text style={[styles.sheetAction, { color: colors.destructive }]}>Clear</Text>
              </Pressable>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>{label}</Text>
              <Pressable onPress={handleConfirm}>
                <Text style={[styles.sheetAction, { color: '#C06070', fontFamily: 'Inter_700Bold' }]}>Done</Text>
              </Pressable>
            </View>
            <DateTimePicker
              value={tempDate}
              mode="date"
              display="inline"
              onChange={handleChange}
              minimumDate={minDate}
              themeVariant="light"
              accentColor="#F8BCCD"
              style={{ width: '100%' }}
            />
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  input: {
    borderRadius: 10, borderWidth: 1, paddingHorizontal: 14,
    paddingVertical: 12, fontSize: 15, fontFamily: 'Inter_400Regular',
  },
  trigger: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 13,
  },
  triggerText: { flex: 1, fontSize: 15, fontFamily: 'Inter_400Regular' },
  webDateInput: {
    flex: 1, fontSize: 15, fontFamily: 'Inter_400Regular',
    borderWidth: 0, backgroundColor: 'transparent', padding: 0,
    // @ts-ignore
    outlineStyle: 'none',
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  sheetAction: { fontSize: 15, fontFamily: 'Inter_500Medium' },
});
