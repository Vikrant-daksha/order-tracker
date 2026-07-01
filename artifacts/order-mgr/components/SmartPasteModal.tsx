import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useColors } from '@/hooks/useColors';
import { parseOrderText, ParsedOrder } from '@/utils/smartPaste';

interface SmartPasteModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (parsed: ParsedOrder) => void;
}

export function SmartPasteModal({ visible, onClose, onConfirm }: SmartPasteModalProps) {
  const colors = useColors();
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ParsedOrder | null>(null);

  async function handlePaste() {
    try {
      const clip = await Clipboard.getStringAsync();
      if (clip) {
        setText(clip);
        handleParse(clip);
      }
    } catch {}
  }

  function handleParse(raw?: string) {
    const input = raw ?? text;
    if (!input.trim()) return;
    const result = parseOrderText(input);
    setParsed(result);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  function handleConfirm() {
    if (!parsed) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onConfirm(parsed);
    setText('');
    setParsed(null);
    onClose();
  }

  function handleClose() {
    setText('');
    setParsed(null);
    onClose();
  }

  // Build display rows from parsed result
  const resultRows: Array<[string, string | undefined]> = parsed
    ? [
        ['Customer Name', parsed.customerName],
        ['Instagram', parsed.contactInfo],
        ['Phone', parsed.phone],
        ['Address', parsed.address],
        ['Pincode', parsed.pincode],
        ['Order Date', parsed.orderDate],
        ['Due Date', parsed.dueDate],
        ['Price', parsed.price ? `₹${parsed.price}` : undefined],
        ['Product', parsed.customName],
        ['Notes', parsed.notes || undefined],
      ]
    : [];

  const hasAnyField = parsed && resultRows.some(([, v]) => v);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.container, { backgroundColor: colors.background }]}
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: 20, borderBottomColor: colors.border }]}>
          <Pressable onPress={handleClose} hitSlop={8}>
            <Feather name="x" size={22} color={colors.mutedForeground} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Feather name="zap" size={15} color="#C06070" />
            <Text style={[styles.title, { color: colors.foreground }]}>Smart Paste</Text>
          </View>
          <Pressable onPress={handlePaste} style={[styles.pasteBtn, { backgroundColor: colors.accent }]}>
            <Feather name="clipboard" size={15} color="#C06070" />
            <Text style={[styles.pasteBtnText, { color: '#C06070' }]}>Paste</Text>
          </Pressable>
        </View>

        <ScrollView style={styles.body} contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            Paste a message from Instagram DM, WhatsApp, email, or any order notification. We'll extract the details automatically — including name, phone, address & pincode.
          </Text>

          <TextInput
            value={text}
            onChangeText={t => { setText(t); setParsed(null); }}
            multiline
            placeholder="Paste order text here..."
            placeholderTextColor={colors.mutedForeground}
            style={[styles.textInput, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
          />

          <Pressable
            onPress={() => handleParse()}
            style={[styles.parseBtn, { backgroundColor: colors.primary, opacity: text.trim() ? 1 : 0.5 }]}
            disabled={!text.trim()}
          >
            <Feather name="zap" size={16} color={colors.primaryForeground} />
            <Text style={[styles.parseBtnText, { color: colors.primaryForeground }]}>Extract Details</Text>
          </Pressable>

          {parsed && (
            <View style={[styles.results, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.resultsHeader}>
                <Feather name="check-circle" size={16} color="#C06070" />
                <Text style={[styles.resultsTitle, { color: colors.foreground }]}>Extracted Fields</Text>
              </View>

              {!hasAnyField && (
                <Text style={[styles.noFields, { color: colors.mutedForeground }]}>
                  Couldn't extract any fields. Try adding labels like "Name:", "Phone:", "Address:".
                </Text>
              )}

              {resultRows.map(([label, val]) =>
                val ? (
                  <View key={label} style={[styles.resultRow, { borderTopColor: colors.border }]}>
                    <Text style={[styles.resultLabel, { color: colors.mutedForeground }]}>{label}</Text>
                    <Text style={[styles.resultVal, { color: colors.foreground }]}>{val}</Text>
                  </View>
                ) : null
              )}

              {hasAnyField && (
                <Pressable
                  onPress={handleConfirm}
                  style={[styles.confirmBtn, { backgroundColor: colors.primary }]}
                >
                  <Feather name="check" size={16} color={colors.primaryForeground} />
                  <Text style={[styles.confirmBtnText, { color: colors.primaryForeground }]}>Use These Details</Text>
                </Pressable>
              )}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  pasteBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 100, paddingHorizontal: 14, paddingVertical: 8 },
  pasteBtnText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  body: { flex: 1 },
  hint: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  textInput: {
    minHeight: 140,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    lineHeight: 20,
    textAlignVertical: 'top',
  },
  parseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 14,
  },
  parseBtnText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  results: { borderRadius: 14, padding: 16, borderWidth: 1, gap: 0 },
  resultsHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  resultsTitle: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  noFields: { fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 20, marginBottom: 8 },
  resultRow: { flexDirection: 'row', gap: 8, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  resultLabel: { fontSize: 13, fontFamily: 'Inter_500Medium', width: 110 },
  resultVal: { fontSize: 13, fontFamily: 'Inter_400Regular', flex: 1 },
  confirmBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 10, paddingVertical: 13, marginTop: 12 },
  confirmBtnText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
});
