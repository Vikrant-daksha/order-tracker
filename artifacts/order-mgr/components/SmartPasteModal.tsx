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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { parseOrderText, ParsedOrder } from '@/utils/smartPaste';

interface SmartPasteModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (parsed: ParsedOrder) => void;
}

export function SmartPasteModal({ visible, onClose, onConfirm }: SmartPasteModalProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
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

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.container, { backgroundColor: colors.background }]}
      >
        <View style={[styles.header, { paddingTop: insets.top + 16, borderBottomColor: colors.border }]}>
          <Pressable onPress={handleClose}>
            <Feather name="x" size={22} color={colors.mutedForeground} />
          </Pressable>
          <Text style={[styles.title, { color: colors.foreground }]}>Smart Paste</Text>
          <Pressable onPress={handlePaste} style={[styles.pasteBtn, { backgroundColor: colors.accent }]}>
            <Feather name="clipboard" size={16} color="#C06070" />
            <Text style={[styles.pasteBtnText, { color: '#C06070' }]}>Paste</Text>
          </Pressable>
        </View>

        <ScrollView style={styles.body} contentContainerStyle={{ padding: 16, gap: 16 }}>
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            Paste a message from Instagram DM, WhatsApp, email, or any order notification. We'll extract the details automatically.
          </Text>

          <TextInput
            value={text}
            onChangeText={setText}
            multiline
            placeholder="Paste order text here..."
            placeholderTextColor={colors.mutedForeground}
            style={[styles.textInput, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]}
          />

          <Pressable
            onPress={() => handleParse()}
            style={[styles.parseBtn, { backgroundColor: colors.primary }]}
          >
            <Feather name="zap" size={16} color={colors.primaryForeground} />
            <Text style={[styles.parseBtnText, { color: colors.primaryForeground }]}>Extract Details</Text>
          </Pressable>

          {parsed && (
            <View style={[styles.results, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.resultsTitle, { color: colors.foreground }]}>Extracted Fields</Text>
              {[
                ['Customer Name', parsed.customerName],
                ['Contact', parsed.contactInfo],
                ['Order Date', parsed.orderDate],
                ['Due Date', parsed.dueDate],
                ['Price', parsed.price ? `₹${parsed.price}` : undefined],
                ['Product', parsed.customName],
                ['Notes', parsed.notes],
              ].map(([label, val]) => val ? (
                <View key={label as string} style={styles.resultRow}>
                  <Text style={[styles.resultLabel, { color: colors.mutedForeground }]}>{label}</Text>
                  <Text style={[styles.resultVal, { color: colors.foreground }]}>{val as string}</Text>
                </View>
              ) : null)}
              <Pressable
                onPress={handleConfirm}
                style={[styles.confirmBtn, { backgroundColor: colors.primary }]}
              >
                <Text style={[styles.confirmBtnText, { color: colors.primaryForeground }]}>Use These Details</Text>
              </Pressable>
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
  results: { borderRadius: 14, padding: 16, borderWidth: 1, gap: 10 },
  resultsTitle: { fontSize: 15, fontFamily: 'Inter_700Bold', marginBottom: 4 },
  resultRow: { flexDirection: 'row', gap: 8 },
  resultLabel: { fontSize: 13, fontFamily: 'Inter_500Medium', width: 110 },
  resultVal: { fontSize: 13, fontFamily: 'Inter_400Regular', flex: 1 },
  confirmBtn: { borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  confirmBtnText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
});
