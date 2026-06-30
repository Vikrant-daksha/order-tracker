import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
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
import { DatePickerField } from '@/components/DatePickerField';
import { ProductAutocomplete } from '@/components/ProductAutocomplete';
import { SmartPasteModal } from '@/components/SmartPasteModal';
import { useColors } from '@/hooks/useColors';
import { useDatabase } from '@/context/DatabaseContext';
import { Order, OrderSource, OrderStatus, PaymentStatus } from '@/types';
import { ParsedOrder } from '@/utils/smartPaste';
import { saveImage, deleteImage } from '@/utils/imageUtils';
import { cancelOrderReminder, scheduleOrderReminder } from '@/utils/notifications';

const SOURCES: OrderSource[] = ['Instagram', 'Facebook', 'WhatsApp', 'Website', 'Email', 'Manual'];
const STATUSES: OrderStatus[] = ['Confirmed', 'Shipped', 'Delivered'];
const PAYMENT_STATUSES: PaymentStatus[] = ['Unpaid', 'Partial', 'Paid'];

function today() { return new Date().toISOString().split('T')[0]; }

export default function NewOrderScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { addOrder, updateOrder, getOrder, products, addProduct, findProductByName } = useDatabase();

  const existing = id ? getOrder(id) : undefined;
  const isEditing = !!existing;

  const [source, setSource] = useState<OrderSource>(existing?.source || 'Instagram');
  const [customerName, setCustomerName] = useState(existing?.customerName || '');
  // contactInfo is stored as "ig\nphone\nemail" — split on load
  const existingContact = (existing?.contactInfo || '').split('\n');
  const [igHandle, setIgHandle] = useState(existingContact[0] || '');
  const [phone, setPhone] = useState(existingContact[1] || '');
  const [email, setEmail] = useState(existingContact[2] || '');
  const [address, setAddress] = useState(existing?.address || '');
  const [orderDate, setOrderDate] = useState(existing?.orderDate || today());
  const [dueDate, setDueDate] = useState(existing?.dueDate || '');
  const [productName, setProductName] = useState(existing?.customName || '');
  const [selectedProductId, setSelectedProductId] = useState(existing?.productId || '');
  const [isCustom, setIsCustom] = useState(existing?.isCustom === 1 || false);
  const [price, setPrice] = useState(existing?.price ? String(existing.price) : '');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(existing?.paymentStatus || 'Unpaid');
  const [amountPaid, setAmountPaid] = useState(existing?.amountPaid ? String(existing.amountPaid) : '');
  const [status, setStatus] = useState<OrderStatus>(existing?.status || 'Confirmed');
  const [trackingLink, setTrackingLink] = useState(existing?.trackingLink || '');
  const [notes, setNotes] = useState(existing?.notes || '');
  const [imageUri, setImageUri] = useState(existing?.referenceImagePath || '');
  const [thumbUri, setThumbUri] = useState(existing?.thumbnailPath || '');
  const [saving, setSaving] = useState(false);
  const [pasteVisible, setPasteVisible] = useState(false);

  // Track whether an in-session image has been committed to a saved order.
  // If the user dismisses the form without saving we delete the file to
  // prevent orphaned assets accumulating on disk.
  const savedImageRef = useRef<{ fullPath: string; thumbnailPath: string } | null>(null);
  const imageSavedToOrder = useRef(false);

  // Cleanup effect: runs when the component unmounts (back navigation, swipe).
  // Only deletes images that were picked *during this session* and never saved.
  useEffect(() => {
    return () => {
      if (!imageSavedToOrder.current && savedImageRef.current) {
        deleteImage(
          savedImageRef.current.fullPath,
          savedImageRef.current.thumbnailPath,
        );
      }
    };
  }, []);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const handleProductChange = useCallback((name: string, product?: any) => {
    setProductName(name);
    if (product) {
      setSelectedProductId(product.id);
      if (!price && product.defaultPrice) setPrice(String(product.defaultPrice));
      if (product.imagePath) { setImageUri(product.imagePath); setThumbUri(product.thumbnailPath); }
      setIsCustom(false);
    } else {
      setSelectedProductId('');
    }
  }, [price]);

  const handleParsed = useCallback((parsed: ParsedOrder) => {
    if (parsed.customerName) setCustomerName(parsed.customerName);
    if (parsed.contactInfo) setIgHandle(parsed.contactInfo);
    if (parsed.orderDate) setOrderDate(parsed.orderDate);
    if (parsed.dueDate) setDueDate(parsed.dueDate);
    if (parsed.price) setPrice(String(parsed.price));
    if (parsed.customName) setProductName(parsed.customName);
    if (parsed.notes) setNotes(parsed.notes);
  }, []);

  async function pickImage() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (!res.canceled && res.assets[0]) {
      setSaving(true);
      try {
        // If the user picked a previous image this session, clean it up first
        if (savedImageRef.current && !imageSavedToOrder.current) {
          deleteImage(
            savedImageRef.current.fullPath,
            savedImageRef.current.thumbnailPath,
          );
        }
        const saved = await saveImage(res.assets[0].uri);
        setImageUri(saved.fullPath);
        setThumbUri(saved.thumbnailPath);
        // Keep a ref to the newly saved temp image for cleanup if form is dismissed
        savedImageRef.current = saved;
        imageSavedToOrder.current = false;
      } finally {
        setSaving(false);
      }
    }
  }

  async function handleSave() {
    if (!customerName.trim()) {
      Alert.alert('Required', 'Please enter a customer name.');
      return;
    }
    setSaving(true);
    try {
      let resolvedProductId = selectedProductId;
      if (productName.trim() && !selectedProductId && !isCustom) {
        const found = findProductByName(productName.trim());
        if (found) {
          resolvedProductId = found.id;
        } else {
          setSaving(false);
          Alert.alert(
            'New Product',
            `Add "${productName}" to your product catalog?`,
            [
              { text: 'Keep as Custom', onPress: () => { setIsCustom(true); setTimeout(() => handleSave(), 100); } },
              {
                text: 'Add to Catalog', onPress: async () => {
                  const pid = await addProduct({
                    name: productName.trim(),
                    imagePath: imageUri,
                    thumbnailPath: thumbUri,
                    defaultPrice: parseFloat(price) || 0,
                    category: '',
                  });
                  await saveOrderData(pid);
                }
              },
            ]
          );
          return;
        }
      }
      await saveOrderData(resolvedProductId);
    } catch {
      Alert.alert('Error', 'Could not save order.');
      setSaving(false);
    }
  }

  async function saveOrderData(productId: string) {
    setSaving(true);
    const data: Omit<Order, 'id' | 'createdAt'> = {
      source,
      customerName: customerName.trim(),
      contactInfo: [igHandle.trim(), phone.trim(), email.trim()].join('\n'),
      address: address.trim(),
      orderDate,
      dueDate,
      productId,
      customName: productName.trim(),
      referenceImagePath: imageUri,
      thumbnailPath: thumbUri,
      price: parseFloat(price) || 0,
      paymentStatus,
      amountPaid: paymentStatus === 'Partial' ? (parseFloat(amountPaid) || 0) : paymentStatus === 'Paid' ? (parseFloat(price) || 0) : 0,
      status,
      trackingLink: trackingLink.trim(),
      notes: notes.trim(),
      isCustom: isCustom ? 1 : 0,
    };

    let savedId: string;
    if (isEditing) {
      await updateOrder(existing!.id, data);
      savedId = existing!.id;
      await cancelOrderReminder(savedId);
    } else {
      savedId = await addOrder(data);
    }

    if (dueDate && status !== 'Delivered') {
      await scheduleOrderReminder(savedId, data.customerName, data.customName, dueDate);
    }

    // Mark the image as committed so the cleanup effect skips deletion
    imageSavedToOrder.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSaving(false);
    router.back();
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()}>
          <Feather name="x" size={22} color={colors.mutedForeground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>{isEditing ? 'Edit Order' : 'New Order'}</Text>
        <View style={styles.headerActions}>
          {!isEditing && (
            <Pressable onPress={() => setPasteVisible(true)} style={[styles.pasteBtn, { backgroundColor: colors.accent }]}>
              <Feather name="clipboard" size={15} color="#C06070" />
              <Text style={[styles.pasteBtnText, { color: '#C06070' }]}>Paste</Text>
            </Pressable>
          )}
          <Pressable onPress={handleSave} disabled={saving} style={[styles.saveBtn, { backgroundColor: colors.primary }]}>
            <Text style={[styles.saveBtnText, { color: colors.primaryForeground }]}>
              {saving ? '...' : 'Save'}
            </Text>
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {/* Source */}
        <FormSection title="Source">
          <SourceDropdown value={source} onChange={setSource} colors={colors} />
        </FormSection>

        {/* Customer */}
        <FormSection title="Customer">
          <FieldInput label="Name *" value={customerName} onChange={setCustomerName} placeholder="Customer name" colors={colors} />
          <FieldInput label="Contact Info" value={igHandle} onChange={setIgHandle} placeholder="@username" colors={colors} />
          <FieldInput value={phone} onChange={setPhone} placeholder="+91 98765 43210" keyboardType="phone-pad" colors={colors} />
          <FieldInput value={email} onChange={setEmail} placeholder="customer@email.com" keyboardType="email-address" colors={colors} />
          <FieldInput label="Delivery Address" value={address} onChange={setAddress} placeholder="Street, city, state, PIN code" colors={colors} multiline />
        </FormSection>

        {/* Dates — using DatePickerField */}
        <FormSection title="Dates">
          <DatePickerField
            label="Order Date"
            value={orderDate}
            onChange={setOrderDate}
            placeholder="Select order date"
          />
          <DatePickerField
            label="Due / Ship Date"
            value={dueDate}
            onChange={setDueDate}
            placeholder="Select due date"
            minDate={orderDate ? new Date(orderDate) : undefined}
          />
          {dueDate ? (
            <View style={[styles.reminderNote, { backgroundColor: colors.accent }]}>
              <Feather name="bell" size={13} color="#C06070" />
              <Text style={[styles.reminderNoteText, { color: '#8B4D5C' }]}>
                You'll get a reminder 2 days before — {formatReminderDate(dueDate)}
              </Text>
            </View>
          ) : null}
        </FormSection>

        {/* Product */}
        <FormSection title="Product">
          <ProductAutocomplete value={productName} onChange={handleProductChange} products={products} placeholder="Search catalog or enter new..." />
          <View style={styles.customRow}>
            <Pressable
              onPress={() => setIsCustom(!isCustom)}
              style={[styles.checkbox, { borderColor: isCustom ? colors.primary : colors.border, backgroundColor: isCustom ? colors.primary : 'transparent' }]}
            >
              {isCustom && <Feather name="check" size={12} color={colors.primaryForeground} />}
            </Pressable>
            <Text style={[styles.checkboxLabel, { color: colors.mutedForeground }]}>
              Mark as custom (don't add to catalog)
            </Text>
          </View>

          <Pressable onPress={pickImage} style={[styles.imagePicker, { backgroundColor: colors.card, borderColor: colors.border, height: 250 }]}>
            {imageUri ? (
              <Image source={{ uri: imageUri }} style={styles.imagePreview} contentFit="cover" />
            ) : (
              <View style={styles.imageEmpty}>
                <Feather name="camera" size={20} color={colors.mutedForeground} />
                <Text style={[styles.imageEmptyText, { color: colors.mutedForeground }]}>Add reference photo</Text>
              </View>
            )}
          </Pressable>
        </FormSection>

        {/* Payment */}
        <FormSection title="Payment">
          <FieldInput label="Price" value={price} onChange={setPrice} placeholder="0.00" keyboardType="decimal-pad" colors={colors} />
          <View style={{ gap: 6 }}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Payment Status</Text>
            <View style={styles.chipRow}>
              {PAYMENT_STATUSES.map(ps => (
                <Pressable
                  key={ps}
                  onPress={() => setPaymentStatus(ps)}
                  style={[styles.chip, {
                    backgroundColor: paymentStatus === ps ? colors.primary : colors.card,
                    borderColor: paymentStatus === ps ? colors.primary : colors.border,
                  }]}
                >
                  <Text style={[styles.chipText, { color: paymentStatus === ps ? colors.primaryForeground : colors.mutedForeground }]}>{ps}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          {paymentStatus === 'Partial' && (
            <FieldInput label="Amount Paid" value={amountPaid} onChange={setAmountPaid} placeholder="0.00" keyboardType="decimal-pad" colors={colors} />
          )}
        </FormSection>

        {/* Status */}
        <FormSection title="Order Status">
          <View style={styles.chipRow}>
            {STATUSES.map(s => (
              <Pressable
                key={s}
                onPress={() => setStatus(s)}
                style={[styles.chip, {
                  backgroundColor: status === s ? colors.primary : colors.card,
                  borderColor: status === s ? colors.primary : colors.border,
                }]}
              >
                <Text style={[styles.chipText, { color: status === s ? colors.primaryForeground : colors.mutedForeground }]}>{s}</Text>
              </Pressable>
            ))}
          </View>
        </FormSection>

        {/* Tracking & Notes */}
        <FormSection title="Additional">
          <FieldInput label="Tracking Link / Number" value={trackingLink} onChange={setTrackingLink} placeholder="Paste tracking URL..." colors={colors} />
          <View style={{ gap: 6 }}>
            <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Notes</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              multiline
              placeholder="Any extra notes..."
              placeholderTextColor={colors.mutedForeground}
              style={[styles.notesInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
            />
          </View>
        </FormSection>
      </ScrollView>

      <SmartPasteModal visible={pasteVisible} onClose={() => setPasteVisible(false)} onConfirm={handleParsed} />
    </View>
  );
}

function formatReminderDate(dueDate: string): string {
  if (!dueDate) return '';
  const due = new Date(`${dueDate}T00:00:00`);
  const reminder = new Date(due);
  reminder.setDate(due.getDate() - 2);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[reminder.getMonth()]} ${reminder.getDate()} at 10:00 AM`;
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>{title.toUpperCase()}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

const SOURCE_ICONS: Record<string, string> = {
  Instagram: 'instagram', Facebook: 'facebook', WhatsApp: 'message-circle',
  Website: 'globe', Email: 'mail', Manual: 'edit-3',
};

function SourceDropdown({ value, onChange, colors }: { value: OrderSource; onChange: (s: OrderSource) => void; colors: any }) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Pressable
        onPress={() => setOpen(true)}
        style={[styles.dropdownTrigger, { backgroundColor: colors.card, borderColor: colors.border }]}
      >
        <Feather name={SOURCE_ICONS[value] as any} size={16} color="#C06070" />
        <Text style={[styles.dropdownValue, { color: colors.foreground }]}>{value}</Text>
        <Feather name="chevron-down" size={16} color={colors.mutedForeground} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.ddBackdrop} onPress={() => setOpen(false)} />
        <View style={[styles.ddList, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {SOURCES.map((s, i) => (
            <Pressable
              key={s}
              onPress={() => { onChange(s); setOpen(false); }}
              style={[styles.ddItem, { borderBottomColor: colors.border, borderBottomWidth: i < SOURCES.length - 1 ? StyleSheet.hairlineWidth : 0 }]}
            >
              <Feather name={SOURCE_ICONS[s] as any} size={16} color={s === value ? '#C06070' : colors.mutedForeground} />
              <Text style={[styles.ddItemText, { color: s === value ? colors.foreground : colors.mutedForeground, fontFamily: s === value ? 'Inter_600SemiBold' : 'Inter_400Regular' }]}>{s}</Text>
              {s === value && <Feather name="check" size={14} color="#C06070" />}
            </Pressable>
          ))}
        </View>
      </Modal>
    </View>
  );
}

function FieldInput({ label, value, onChange, placeholder, keyboardType, colors, multiline }: any) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        keyboardType={keyboardType || 'default'}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
        style={[
          styles.textInput,
          { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground },
          multiline && { minHeight: 72, textAlignVertical: 'top', paddingTop: 12 },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  headerActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  pasteBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 100, paddingHorizontal: 12, paddingVertical: 7 },
  pasteBtnText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  saveBtn: { borderRadius: 100, paddingHorizontal: 18, paddingVertical: 8 },
  saveBtnText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  body: { padding: 16, gap: 20, paddingBottom: 60 },
  section: { gap: 10 },
  sectionTitle: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.8 },
  sectionBody: { gap: 12 },
  chip: { borderRadius: 100, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1 },
  chipText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fieldLabel: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  textInput: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: 'Inter_400Regular' },
  customRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  checkboxLabel: { fontSize: 13, fontFamily: 'Inter_400Regular', flex: 1 },
  imagePicker: { height: 100, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', overflow: 'hidden' },
  imagePreview: { width: '100%', height: '100%' },
  imageEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  imageEmptyText: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  notesInput: { borderRadius: 10, borderWidth: 1, padding: 14, fontSize: 14, fontFamily: 'Inter_400Regular', minHeight: 90, textAlignVertical: 'top' },
  reminderNote: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
  },
  reminderNoteText: { fontSize: 13, fontFamily: 'Inter_500Medium', flex: 1 },
  dropdownTrigger: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 13,
  },
  dropdownValue: { flex: 1, fontSize: 15, fontFamily: 'Inter_500Medium' },
  ddBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  ddList: {
    marginHorizontal: 16, borderRadius: 14, borderWidth: 1,
    overflow: 'hidden', marginBottom: 40,
  },
  ddItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  ddItemText: { flex: 1, fontSize: 15 },
});
