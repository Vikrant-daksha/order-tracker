import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
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
import { useDatabase } from '@/context/DatabaseContext';
import { saveImage, deleteImage } from '@/utils/imageUtils';

export default function CustomerEditScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id: customerId } = useLocalSearchParams<{ id: string }>();
  const { customers, updateCustomer } = useDatabase();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const customer = customers.find(c => c.id === customerId);

  const [name, setName] = useState(customer?.name ?? '');
  const [igHandle, setIgHandle] = useState(customer?.igHandle ?? '');
  const [phone, setPhone] = useState(customer?.phone ?? '');
  const [email, setEmail] = useState(customer?.email ?? '');
  const [address, setAddress] = useState(customer?.address ?? '');
  const [size, setSize] = useState(customer?.size ?? '');
  const [sizeImageUris, setSizeImageUris] = useState<string[]>(
    customer?.sizeImagePaths ?? (customer?.sizeImagePath ? [customer.sizeImagePath] : [])
  );
  const [sizeThumbUris, setSizeThumbUris] = useState<string[]>(
    customer?.sizeThumbnailPaths ?? (customer?.sizeThumbnailPath ? [customer.sizeThumbnailPath] : [])
  );
  const [notes, setNotes] = useState(customer?.notes ?? '');
  const [saving, setSaving] = useState(false);

  // Sync fields if customer data arrives after initial render
  useEffect(() => {
    if (customer) {
      setName(customer.name ?? '');
      setIgHandle(customer.igHandle ?? '');
      setPhone(customer.phone ?? '');
      setEmail(customer.email ?? '');
      setAddress(customer.address ?? '');
      setSize(customer.size ?? '');
      setSizeImageUris(customer.sizeImagePaths ?? (customer.sizeImagePath ? [customer.sizeImagePath] : []));
      setSizeThumbUris(customer.sizeThumbnailPaths ?? (customer.sizeThumbnailPath ? [customer.sizeThumbnailPath] : []));
      setNotes(customer.notes ?? '');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.id]);

  // Refs for sequential keyboard navigation
  const igRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const addressRef = useRef<TextInput>(null);
  const sizeRef = useRef<TextInput>(null);
  const notesRef = useRef<TextInput>(null);

  async function pickSizeImage() {
    if (sizeImageUris.length >= 10) {
      Alert.alert('Limit Reached', 'You can upload up to 10 measurement photos.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
      allowsMultipleSelection: true,
      selectionLimit: 10 - sizeImageUris.length,
    });
    if (!res.canceled && res.assets && res.assets.length > 0) {
      try {
        const newImages: string[] = [];
        const newThumbs: string[] = [];
        for (const asset of res.assets) {
          const saved = await saveImage(asset.uri);
          newImages.push(saved.fullPath);
          newThumbs.push(saved.thumbnailPath);
        }
        setSizeImageUris(prev => [...prev, ...newImages]);
        setSizeThumbUris(prev => [...prev, ...newThumbs]);
      } catch {
        Alert.alert('Error', 'Could not save selected image.');
      }
    }
  }

  function moveSizeImage(imgIndex: number, direction: 'left' | 'right') {
    const targetIdx = direction === 'left' ? imgIndex - 1 : imgIndex + 1;
    if (targetIdx < 0 || targetIdx >= sizeImageUris.length) return;
    const nextImages = [...sizeImageUris];
    const tempImg = nextImages[imgIndex];
    nextImages[imgIndex] = nextImages[targetIdx];
    nextImages[targetIdx] = tempImg;

    const nextThumbs = [...sizeThumbUris];
    const tempThumb = nextThumbs[imgIndex];
    nextThumbs[imgIndex] = nextThumbs[targetIdx];
    nextThumbs[targetIdx] = tempThumb;

    setSizeImageUris(nextImages);
    setSizeThumbUris(nextThumbs);
  }

  function deleteSizeImage(imgIndex: number) {
    const targetImg = sizeImageUris[imgIndex];
    const targetThumb = sizeThumbUris[imgIndex];
    setSizeImageUris(prev => prev.filter((_, i) => i !== imgIndex));
    setSizeThumbUris(prev => prev.filter((_, i) => i !== imgIndex));
    deleteImage(targetImg, targetThumb);
  }

  async function handleSave() {
    if (!name.trim()) {
      Alert.alert('Name required', 'Please enter a customer name.');
      return;
    }
    setSaving(true);
    try {
      await updateCustomer(customerId, {
        name: name.trim(),
        igHandle: igHandle.trim(),
        phone: phone.trim(),
        email: email.trim(),
        address: address.trim(),
        size: size.trim(),
        sizeImagePath: sizeImageUris[0] || '',
        sizeThumbnailPath: sizeThumbUris[0] || '',
        sizeImagePaths: sizeImageUris,
        sizeThumbnailPaths: sizeThumbUris,
        notes: notes.trim(),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch {
      Alert.alert('Error', 'Could not save changes. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const avatarLetter = name.trim().charAt(0).toUpperCase() || '?';

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* ── Header ── */}
      <View
        style={[
          styles.header,
          {
            paddingTop: topPad + 8,
            borderBottomColor: colors.border,
            backgroundColor: colors.background,
          },
        ]}
      >
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Feather name="x" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          Edit Customer
        </Text>
        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={{ opacity: saving ? 0.5 : 1 }}
          hitSlop={8}
        >
          <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save'}</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + 40 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Avatar live preview ── */}
        <View style={styles.avatarWrap}>
          <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
            <Text style={[styles.avatarText, { color: '#C06070' }]}>
              {avatarLetter}
            </Text>
          </View>
          <Text style={[styles.avatarSubtitle, { color: colors.mutedForeground }]}>
            Customer profile
          </Text>
        </View>

        {/* ── Form fields ── */}
        <View style={styles.form}>
          <Field
            label="Full Name"
            icon="user"
            value={name}
            onChangeText={setName}
            placeholder="e.g. Priya Sharma"
            returnKeyType="next"
            onSubmitEditing={() => igRef.current?.focus()}
            autoCapitalize="words"
            colors={colors}
          />

          <Field
            ref={igRef}
            label="Instagram"
            icon="instagram"
            value={igHandle}
            onChangeText={setIgHandle}
            placeholder="handle (without @)"
            returnKeyType="next"
            onSubmitEditing={() => phoneRef.current?.focus()}
            autoCapitalize="none"
            autoCorrect={false}
            colors={colors}
            prefix="@"
          />

          <Field
            ref={phoneRef}
            label="Phone"
            icon="phone"
            value={phone}
            onChangeText={setPhone}
            placeholder="+91 98765 43210"
            returnKeyType="next"
            onSubmitEditing={() => emailRef.current?.focus()}
            keyboardType="phone-pad"
            colors={colors}
          />

          <Field
            ref={emailRef}
            label="Email"
            icon="mail"
            value={email}
            onChangeText={setEmail}
            placeholder="customer@email.com"
            returnKeyType="next"
            onSubmitEditing={() => addressRef.current?.focus()}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            colors={colors}
          />

          <Field
            ref={addressRef}
            label="Address"
            icon="map-pin"
            value={address}
            onChangeText={setAddress}
            placeholder="Street, City, State, PIN"
            returnKeyType="next"
            onSubmitEditing={() => sizeRef.current?.focus()}
            multiline
            numberOfLines={3}
            colors={colors}
          />

          <Field
            ref={sizeRef}
            label="Size / Measurements"
            icon="maximize-2"
            value={size}
            onChangeText={setSize}
            placeholder="e.g. Size M, Bust: 36, Waist: 30, Height: 5'6..."
            returnKeyType="next"
            onSubmitEditing={() => notesRef.current?.focus()}
            colors={colors}
          />

          {/* Size / Measurement Photos */}
          <View style={{ marginTop: 2, marginBottom: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground, marginBottom: 0 }]}>
                Measurement & Size Photos
              </Text>
              <Text style={{ fontSize: 11, color: colors.mutedForeground }}>
                ({sizeImageUris.length}/10)
              </Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 10, paddingVertical: 4 }}
            >
              {sizeImageUris.map((uri, idx) => (
                <View key={uri + idx} style={{ alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 80, height: 80, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, position: 'relative' }}>
                    <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                    <Pressable
                      onPress={() => deleteSizeImage(idx)}
                      style={{
                        position: 'absolute', top: 4, right: 4,
                        backgroundColor: 'rgba(0,0,0,0.6)', width: 18, height: 18,
                        borderRadius: 9, alignItems: 'center', justifyContent: 'center'
                      }}
                    >
                      <Feather name="x" size={10} color="#fff" />
                    </Pressable>
                  </View>
                  {sizeImageUris.length > 1 && (
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      {idx > 0 ? (
                        <Pressable onPress={() => moveSizeImage(idx, 'left')} style={{ padding: 3, backgroundColor: colors.accent, borderRadius: 4 }}>
                          <Feather name="chevron-left" size={12} color="#C06070" />
                        </Pressable>
                      ) : <View style={{ width: 18 }} />}
                      {idx < sizeImageUris.length - 1 ? (
                        <Pressable onPress={() => moveSizeImage(idx, 'right')} style={{ padding: 3, backgroundColor: colors.accent, borderRadius: 4 }}>
                          <Feather name="chevron-right" size={12} color="#C06070" />
                        </Pressable>
                      ) : <View style={{ width: 18 }} />}
                    </View>
                  )}
                </View>
              ))}
              {sizeImageUris.length < 10 && (
                <Pressable
                  onPress={pickSizeImage}
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderStyle: 'dashed',
                    backgroundColor: colors.card,
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                  }}
                >
                  <Feather name="camera" size={18} color="#C06070" />
                  <Text style={{ fontSize: 10, color: colors.mutedForeground, fontFamily: 'Inter_500Medium' }}>
                    Add Photo
                  </Text>
                </Pressable>
              )}
            </ScrollView>
          </View>

          <Field
            ref={notesRef}
            label="Additional Notes"
            icon="file-text"
            value={notes}
            onChangeText={setNotes}
            placeholder="Preferences, special instructions, sizing notes..."
            returnKeyType="done"
            onSubmitEditing={handleSave}
            multiline
            numberOfLines={3}
            colors={colors}
          />
        </View>

        {/* ── Primary save button ── */}
        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={({ pressed }) => [
            styles.bottomSaveBtn,
            { opacity: pressed || saving ? 0.8 : 1 },
          ]}
        >
          <Feather name="check" size={17} color="#fff" />
          <Text style={styles.bottomSaveBtnText}>
            {saving ? 'Saving…' : 'Save Changes'}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Reusable labeled field ────────────────────────────────────────────────────

interface FieldProps {
  label: string;
  icon: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  returnKeyType?: any;
  onSubmitEditing?: () => void;
  keyboardType?: any;
  autoCapitalize?: any;
  autoCorrect?: boolean;
  multiline?: boolean;
  numberOfLines?: number;
  colors: any;
  prefix?: string;
}

const Field = React.forwardRef<TextInput, FieldProps>(
  (
    {
      label,
      icon,
      value,
      onChangeText,
      placeholder,
      returnKeyType,
      onSubmitEditing,
      keyboardType,
      autoCapitalize,
      autoCorrect,
      multiline,
      numberOfLines,
      colors,
      prefix,
    },
    ref,
  ) => {
    const [focused, setFocused] = useState(false);
    return (
      <View style={styles.fieldWrap}>
        <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
          {label}
        </Text>
        <View
          style={[
            styles.fieldBox,
            {
              backgroundColor: colors.card,
              borderColor: focused ? '#C06070' : colors.border,
              borderWidth: focused ? 1.5 : 1,
            },
          ]}
        >
          <Feather
            name={icon as any}
            size={16}
            color={focused ? '#C06070' : colors.mutedForeground}
          />
          {prefix ? (
            <Text style={[styles.prefix, { color: colors.mutedForeground }]}>
              {prefix}
            </Text>
          ) : null}
          <TextInput
            ref={ref}
            style={[
              styles.input,
              {
                color: colors.foreground,
                textAlignVertical: multiline ? 'top' : 'center',
                minHeight: multiline ? 72 : undefined,
              },
            ]}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={colors.mutedForeground + '88'}
            returnKeyType={returnKeyType}
            onSubmitEditing={onSubmitEditing}
            keyboardType={keyboardType}
            autoCapitalize={autoCapitalize}
            autoCorrect={autoCorrect}
            multiline={multiline}
            numberOfLines={numberOfLines}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            blurOnSubmit={!multiline}
          />
        </View>
      </View>
    );
  },
);

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
    flex: 1,
    textAlign: 'center',
  },
  saveBtnText: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: '#C06070',
  },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  avatarWrap: {
    alignItems: 'center',
    marginBottom: 28,
    gap: 8,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 32,
    fontFamily: 'Inter_700Bold',
  },
  avatarSubtitle: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  form: {
    gap: 16,
  },
  fieldWrap: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  fieldBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: Platform.OS === 'ios' ? 13 : 4,
    gap: 10,
  },
  prefix: {
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
    marginRight: -6,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
  },
  bottomSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 32,
    backgroundColor: '#C06070',
    borderRadius: 14,
    paddingVertical: 15,
  },
  bottomSaveBtnText: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    color: '#fff',
  },
});
