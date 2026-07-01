import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  KeyboardAvoidingView,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DatePickerField } from '@/components/DatePickerField';
import { ProductAutocomplete } from '@/components/ProductAutocomplete';
import { SmartPasteModal } from '@/components/SmartPasteModal';
import { useColors } from '@/hooks/useColors';
import { useDatabase } from '@/context/DatabaseContext';
import { Order, OrderSource, OrderStatus, PaymentStatus, Customer } from '@/types';
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
  const { addOrder, updateOrder, getOrder, products, addProduct, findProductByName, customers, addCustomer, updateCustomer, findCustomerByIg, findCustomerByPhone } = useDatabase();

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

  interface OrderItemState {
    id: string;
    productId: string;
    productName: string;
    size: string;
    price: string;
    quantity: string;
    imageUri: string;
    thumbUri: string;
    isCustom: boolean;
  }

  const genId = () => Date.now().toString(36) + Math.random().toString(36).substring(2, 8);

  const [items, setItems] = useState<OrderItemState[]>(() => {
    if (isEditing && existing) {
      if (existing.items && existing.items.length > 0) {
        return existing.items.map(item => ({
          id: item.id,
          productId: item.productId || '',
          productName: item.productName || '',
          size: item.size || '',
          price: String(item.price || ''),
          quantity: String(item.quantity || 1),
          imageUri: item.imagePath || '',
          thumbUri: item.thumbnailPath || '',
          isCustom: item.isCustom,
        }));
      } else {
        return [{
          id: 'legacy-' + existing.id,
          productId: existing.productId || '',
          productName: existing.customName || '',
          size: existing.size || '',
          price: existing.price ? String(existing.price) : '',
          quantity: '1',
          imageUri: existing.referenceImagePath || '',
          thumbUri: existing.thumbnailPath || '',
          isCustom: existing.isCustom === 1,
        }];
      }
    }
    return [{
      id: genId(),
      productId: '',
      productName: '',
      size: '',
      price: '',
      quantity: '1',
      imageUri: '',
      thumbUri: '',
      isCustom: false,
    }];
  });

  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(existing?.paymentStatus || 'Unpaid');
  const [amountPaid, setAmountPaid] = useState(existing?.amountPaid ? String(existing.amountPaid) : '');
  const [status, setStatus] = useState<OrderStatus>(existing?.status || 'Confirmed');
  const [trackingLink, setTrackingLink] = useState(existing?.trackingLink || '');
  const [notes, setNotes] = useState(existing?.notes || '');
  const [saving, setSaving] = useState(false);
  const [pasteVisible, setPasteVisible] = useState(false);
  const [linkedCustomer, setLinkedCustomer] = useState<Customer | null>(null);

  const totalPrice = React.useMemo(() => {
    return items.reduce((sum, item) => {
      const p = parseFloat(item.price) || 0;
      const q = parseInt(item.quantity) || 1;
      return sum + (p * q);
    }, 0);
  }, [items]);

  useEffect(() => {
    if (isEditing && existing?.customerId) {
      const c = customers.find(x => x.id === existing.customerId);
      if (c) setLinkedCustomer(c);
    }
  }, [isEditing, existing, customers]);

  const [isSearching, setIsSearching] = useState(false);
  const unlinkedIds = useRef(new Set<string>());

  useEffect(() => {
    if (isEditing || (!igHandle && !phone)) {
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(() => {
      const match = (igHandle ? findCustomerByIg(igHandle) : null) || (phone ? findCustomerByPhone(phone) : null);
      if (match && match.id !== linkedCustomer?.id && !unlinkedIds.current.has(match.id)) {
        setLinkedCustomer(match);
        if (!customerName) setCustomerName(match.name);
        if (match.email && !email) setEmail(match.email);
        if (match.address && !address) setAddress(match.address);
        if (match.phone && !phone) setPhone(match.phone);
        if (match.igHandle && !igHandle) setIgHandle(match.igHandle);
      }
      setIsSearching(false);
    }, 5000);

    return () => {
      clearTimeout(timer);
      setIsSearching(false);
    };
  }, [igHandle, phone, isEditing, findCustomerByIg, findCustomerByPhone]);

  const pickedImagesRef = useRef<{ fullPath: string; thumbnailPath: string }[]>([]);
  const imageSavedToOrder = useRef(false);

  useEffect(() => {
    return () => {
      if (!imageSavedToOrder.current && pickedImagesRef.current.length > 0) {
        pickedImagesRef.current.forEach(img => {
          deleteImage(img.fullPath, img.thumbnailPath);
        });
      }
    };
  }, []);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const handleParsed = useCallback((parsed: ParsedOrder) => {
    if (parsed.customerName) setCustomerName(parsed.customerName);
    if (parsed.contactInfo) setIgHandle(parsed.contactInfo);
    if (parsed.phone) setPhone(parsed.phone);
    if (parsed.address) setAddress(parsed.address);
    if (parsed.orderDate) setOrderDate(parsed.orderDate);
    if (parsed.dueDate) setDueDate(parsed.dueDate);

    setItems(prev => {
      const next = [...prev];
      if (next.length > 0) {
        next[0] = {
          ...next[0],
          productName: parsed.customName || next[0].productName,
          price: parsed.price ? String(parsed.price) : next[0].price,
        };
      }
      return next;
    });
    if (parsed.notes) setNotes(parsed.notes);
  }, []);

  async function pickImage(index: number) {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (!res.canceled && res.assets[0]) {
      setSaving(true);
      try {
        const saved = await saveImage(res.assets[0].uri);
        setItems(prev => {
          const next = [...prev];
          next[index] = {
            ...next[index],
            imageUri: saved.fullPath,
            thumbUri: saved.thumbnailPath,
          };
          return next;
        });
        pickedImagesRef.current.push(saved);
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

    const emptyNameIndex = items.findIndex(item => !item.productName.trim());
    if (emptyNameIndex >= 0) {
      Alert.alert('Required', `Please enter a product name for Product #${emptyNameIndex + 1}.`);
      return;
    }

    setSaving(true);
    try {
      const resolvedItems = [];
      for (const item of items) {
        let resolvedProductId = item.productId;
        if (item.productName.trim() && !item.productId && !item.isCustom) {
          const found = findProductByName(item.productName.trim());
          if (found) {
            resolvedProductId = found.id;
          } else {
            const pVal = parseFloat(item.price) || 0;
            const newPid = await addProduct({
              name: item.productName.trim(),
              imagePath: item.imageUri,
              thumbnailPath: item.thumbUri,
              defaultPrice: pVal,
              category: '',
            });
            resolvedProductId = newPid;
          }
        }
        resolvedItems.push({
          ...item,
          productId: resolvedProductId,
        });
      }
      await saveOrderData(resolvedItems);
    } catch (err) {
      console.error("Could not save order:", err);
      Alert.alert('Error', 'Could not save order.');
      setSaving(false);
    }
  }

  async function saveOrderData(resolvedItems: OrderItemState[]) {
    setSaving(true);
    let cid = linkedCustomer?.id;
    if (linkedCustomer) {
      await updateCustomer(linkedCustomer.id, {
        name: customerName.trim(),
        igHandle: igHandle.trim(),
        phone: phone.trim(),
        email: email.trim(),
        address: address.trim()
      });
    } else {
      cid = await addCustomer({
        name: customerName.trim(),
        igHandle: igHandle.trim(),
        phone: phone.trim(),
        email: email.trim(),
        address: address.trim()
      });
    }

    const orderItems = resolvedItems.map(item => ({
      id: item.id,
      productId: item.productId || undefined,
      productName: item.productName.trim(),
      size: item.size.trim() || undefined,
      price: parseFloat(item.price) || 0,
      quantity: parseInt(item.quantity) || 1,
      imagePath: item.imageUri || undefined,
      thumbnailPath: item.thumbUri || undefined,
      isCustom: item.isCustom,
    }));

    const firstItem = orderItems[0];
    let summarizedName = firstItem.productName;
    if (orderItems.length > 1) {
      summarizedName = `${firstItem.productName} (+${orderItems.length - 1} items)`;
    }

    const data: Omit<Order, 'id' | 'createdAt'> = {
      source,
      customerName: customerName.trim(),
      contactInfo: [igHandle.trim(), phone.trim(), email.trim()].join('\n'),
      address: address.trim(),
      orderDate,
      dueDate,
      productId: firstItem.productId || '',
      customName: summarizedName,
      referenceImagePath: firstItem.imagePath || '',
      thumbnailPath: firstItem.thumbnailPath || '',
      price: totalPrice,
      paymentStatus,
      amountPaid: paymentStatus === 'Partial' ? (parseFloat(amountPaid) || 0) : paymentStatus === 'Paid' ? totalPrice : 0,
      status,
      trackingLink: trackingLink.trim(),
      notes: notes.trim(),
      isCustom: firstItem.isCustom ? 1 : 0,
      size: firstItem.size || '',
      customerId: cid,
      items: orderItems,
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

    imageSavedToOrder.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSaving(false);
    router.back();
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[styles.title, { color: colors.foreground }]}>{isEditing ? 'Edit Order' : 'New Order'}</Text>
        </View>
        <View style={{ width: 22 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.body, { paddingBottom: 30 }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {/* Source */}
          <FormSection title="Source">
            <SourceDropdown value={source} onChange={setSource} colors={colors} />
          </FormSection>

          {/* Customer */}
          <FormSection title="Customer">
            {linkedCustomer && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.accent, padding: 8, borderRadius: 8, marginBottom: 10 }}>
                <Feather name="user-check" size={16} color="#C06070" />
                <Text style={{ flex: 1, fontSize: 13, color: '#C06070', fontFamily: 'Inter_500Medium' }}>Linked to existing customer: {linkedCustomer.name}</Text>
                <Pressable onPress={() => { unlinkedIds.current.add(linkedCustomer.id); setLinkedCustomer(null); }}>
                  <Text style={{ fontSize: 13, color: colors.destructive, fontFamily: 'Inter_500Medium' }}>Unlink</Text>
                </Pressable>
              </View>
            )}
            <FieldInput label="Name *" value={customerName} onChange={setCustomerName} placeholder="Customer name" colors={colors} />

            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginBottom: 0 }]}>Contact Info</Text>
                {isSearching && <ActivityIndicator size="small" color="#C06070" />}
              </View>
              <View style={{ borderRadius: 10, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
                <TextInput
                  value={igHandle}
                  onChangeText={setIgHandle}
                  placeholder="@instagram"
                  placeholderTextColor={colors.mutedForeground}
                  style={[styles.textInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground, borderWidth: 0, borderRadius: 0, borderBottomWidth: 1 }]}
                />
                <TextInput
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="+91 98765 43210"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="phone-pad"
                  style={[styles.textInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground, borderWidth: 0, borderRadius: 0, borderBottomWidth: 1 }]}
                />
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="google@gmail.com"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="email-address"
                  style={[styles.textInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground, borderWidth: 0, borderRadius: 0 }]}
                />
              </View>
            </View>

            <FieldInput label="Delivery Address" value={address} onChange={setAddress} placeholder="Street, city, state, PIN code" colors={colors} multiline />
          </FormSection>

          {/* Dates */}
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

          {/* Products / Items */}
          <View style={{ gap: 16 }}>
            {items.map((item, index) => (
              <FormSection
                key={item.id}
                title={
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flex: 1, marginRight: 8 }}>
                    <Text style={{ fontSize: 16, fontFamily: 'Inter_600SemiBold', color: colors.foreground }}>Product #{index + 1}</Text>
                    {items.length > 1 && (
                      <Pressable
                        onPress={() => {
                          setItems(prev => prev.filter(x => x.id !== item.id));
                        }}
                        style={{ padding: 4 }}
                      >
                        <Feather name="trash-2" size={18} color={colors.destructive} />
                      </Pressable>
                    )}
                  </View>
                }
              >
                <ProductAutocomplete
                  value={item.productName}
                  onChange={(name, product) => {
                    setItems(prev => {
                      const next = [...prev];
                      next[index] = {
                        ...next[index],
                        productName: name,
                        productId: product ? product.id : '',
                        price: product && !item.price ? String(product.defaultPrice) : item.price,
                        imageUri: product && product.imagePath ? product.imagePath : item.imageUri,
                        thumbUri: product && product.thumbnailPath ? product.thumbnailPath : item.thumbUri,
                        isCustom: product ? false : item.isCustom,
                      };
                      return next;
                    });
                  }}
                  products={products}
                  placeholder="Search catalog or enter name..."
                />

                <View style={styles.customRow}>
                  <Pressable
                    onPress={() => {
                      setItems(prev => {
                        const next = [...prev];
                        next[index] = { ...next[index], isCustom: !item.isCustom };
                        return next;
                      });
                    }}
                    style={[
                      styles.checkbox,
                      {
                        borderColor: item.isCustom ? colors.primary : colors.border,
                        backgroundColor: item.isCustom ? colors.primary : 'transparent',
                      },
                    ]}
                  >
                    {item.isCustom && <Feather name="check" size={12} color={colors.primaryForeground} />}
                  </Pressable>
                  <Text style={[styles.checkboxLabel, { color: colors.mutedForeground }]}>
                    Mark as custom (don't add to catalog)
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ flex: 2 }}>
                    <FieldInput
                      label="Unit Price"
                      value={item.price}
                      onChange={(val: string) => {
                        setItems(prev => {
                          const next = [...prev];
                          next[index] = { ...next[index], price: val };
                          return next;
                        });
                      }}
                      placeholder="0.00"
                      keyboardType="decimal-pad"
                      colors={colors}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <FieldInput
                      label="Qty"
                      value={item.quantity}
                      onChange={(val: string) => {
                        setItems(prev => {
                          const next = [...prev];
                          next[index] = { ...next[index], quantity: val };
                          return next;
                        });
                      }}
                      placeholder="1"
                      keyboardType="number-pad"
                      colors={colors}
                    />
                  </View>
                </View>

                <FieldInput
                  label="Size"
                  value={item.size}
                  onChange={(val: string) => {
                    setItems(prev => {
                      const next = [...prev];
                      next[index] = { ...next[index], size: val };
                      return next;
                    });
                  }}
                  placeholder="e.g. XL, 10x12..."
                  colors={colors}
                />

                <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginTop: 4, marginBottom: 6 }]}>Reference Photo</Text>
                <Pressable
                  onPress={() => pickImage(index)}
                  style={[
                    styles.imagePicker,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                      height: 150,
                      borderRadius: 12,
                      borderStyle: 'dashed',
                      borderWidth: 1,
                      justifyContent: 'center',
                      alignItems: 'center',
                      overflow: 'hidden',
                    },
                  ]}
                >
                  {item.imageUri ? (
                    <Image source={{ uri: item.imageUri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Feather name="camera" size={16} color={colors.mutedForeground} />
                      <Text style={{ fontSize: 13, fontFamily: 'Inter_500Medium', color: colors.mutedForeground }}>Add image</Text>
                    </View>
                  )}
                </Pressable>
              </FormSection>
            ))}

            <Pressable
              onPress={() => {
                setItems(prev => [...prev, {
                  id: genId(),
                  productId: '',
                  productName: '',
                  size: '',
                  price: '',
                  quantity: '1',
                  imageUri: '',
                  thumbUri: '',
                  isCustom: false,
                }]);
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: 14,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: '#C06070',
                borderStyle: 'dashed',
                marginHorizontal: 16,
                backgroundColor: colors.accent,
              }}
            >
              <Feather name="plus" size={16} color="#C06070" />
              <Text style={{ fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#C06070' }}>Add Another Product</Text>
            </Pressable>
          </View>

          {/* Payment */}
          <FormSection title="Payment">
            <View style={{ marginBottom: 16 }}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginBottom: 4 }]}>Total Price (Calculated)</Text>
              <View style={{
                backgroundColor: colors.accent,
                padding: 14,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
              }}>
                <Text style={{ fontSize: 18, fontFamily: 'Inter_700Bold', color: '#C06070' }}>₹{totalPrice.toFixed(2)}</Text>
              </View>
            </View>
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
        {/* Sticky Action Buttons */}
        <View style={{ padding: 16, paddingTop: 12, paddingBottom: Math.max(insets.bottom + 8, 16), borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.background }}>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            {!isEditing && (
              <Pressable onPress={() => setPasteVisible(true)} style={[styles.pasteBtn, { flex: 1, backgroundColor: colors.accent, justifyContent: 'center', paddingVertical: 14, borderRadius: 14 }]}>
                <Feather name="clipboard" size={16} color="#C06070" />
                <Text style={[styles.pasteBtnText, { color: '#C06070', fontSize: 16 }]}>Paste</Text>
              </Pressable>
            )}
            <Pressable onPress={handleSave} disabled={saving} style={[styles.saveBtn, { flex: 1, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', paddingVertical: 14, borderRadius: 14 }]}>
              <Text style={[styles.saveBtnText, { color: colors.primaryForeground, fontSize: 16 }]}>
                {saving ? 'Saving...' : 'Save Order'}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

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

function FormSection({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={styles.section}>
      {title && typeof title === 'string' ? (
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>{title.toUpperCase()}</Text>
      ) : React.isValidElement(title) ? (
        title
      ) : title ? (
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>{String(title).toUpperCase()}</Text>
      ) : null}
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
    <View style={{ zIndex: open ? 100 : 1 }}>
      <Pressable
        onPress={() => setOpen(o => !o)}
        style={[styles.dropdownTrigger, { backgroundColor: colors.card, borderColor: open ? colors.primary : colors.border }]}
      >
        <Feather name={SOURCE_ICONS[value] as any} size={16} color="#C06070" />
        <Text style={[styles.dropdownValue, { color: colors.foreground }]}>{value}</Text>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.mutedForeground} />
      </Pressable>
      {open && (
        <>
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() => setOpen(false)}
            pointerEvents="box-none"
          />
          <View style={[styles.ddList, { backgroundColor: colors.card, borderColor: colors.border, position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200 }]}>
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
        </>
      )}
    </View>
  );
}

function FieldInput({ label, value, onChange, placeholder, keyboardType, colors, multiline }: any) {
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{label}</Text> : null}
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        keyboardType={keyboardType || 'default'}
        multiline={multiline}
        numberOfLines={multiline ? 6 : 1}
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
  nogap: { gap: 0 },
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
    borderRadius: 14, borderWidth: 1,
    overflow: 'hidden', marginTop: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  ddItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  ddItemText: { flex: 1, fontSize: 15 },
});
