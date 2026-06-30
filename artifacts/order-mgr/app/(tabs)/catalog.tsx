import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useDatabase } from '@/context/DatabaseContext';
import { Product } from '@/types';
import { saveImage } from '@/utils/imageUtils';

export default function CatalogScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { products, addProduct, updateProduct, deleteProduct, orders } = useDatabase();
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [price, setPrice] = useState('');
  const [imageUri, setImageUri] = useState('');
  const [thumbUri, setThumbUri] = useState('');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;

  const filtered = products.filter(p =>
    search ? p.name.toLowerCase().includes(search.toLowerCase()) : true
  );

  function openAdd() {
    setEditing(null);
    setName(''); setCategory(''); setPrice(''); setImageUri(''); setThumbUri('');
    setModalVisible(true);
  }

  function openEdit(p: Product) {
    setEditing(p);
    setName(p.name); setCategory(p.category); setPrice(p.defaultPrice ? String(p.defaultPrice) : '');
    setImageUri(p.imagePath); setThumbUri(p.thumbnailPath);
    setModalVisible(true);
  }

  async function pickImage() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (!res.canceled && res.assets[0]) {
      setSaving(true);
      try {
        const saved = await saveImage(res.assets[0].uri);
        setImageUri(saved.fullPath);
        setThumbUri(saved.thumbnailPath);
      } finally {
        setSaving(false);
      }
    }
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const data = { name: name.trim(), category, defaultPrice: parseFloat(price) || 0, imagePath: imageUri, thumbnailPath: thumbUri };
      if (editing) {
        await updateProduct(editing.id, data);
      } else {
        await addProduct(data);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setModalVisible(false);
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(p: Product) {
    const usedElsewhere = orders.some(o => o.productId === p.id);
    Alert.alert(
      'Delete Product',
      usedElsewhere
        ? `"${p.name}" is used in existing orders. Delete from catalog only?`
        : `Delete "${p.name}" from catalog?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteProduct(p.id) },
      ]
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={filtered}
        keyExtractor={p => p.id}
        numColumns={2}
        columnWrapperStyle={{ paddingHorizontal: 16, gap: 12 }}
        contentContainerStyle={{ paddingBottom: Platform.OS === 'web' ? 100 : insets.bottom + 100 }}
        scrollEnabled={filtered.length > 0}
        ListHeaderComponent={
          <>
            <View style={[styles.header, { paddingTop: topPad + 8 }]}>
              <Text style={[styles.title, { color: colors.foreground }]}>Catalog</Text>
              <Text style={[styles.count, { color: colors.mutedForeground }]}>{products.length}</Text>
            </View>
            <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border, marginHorizontal: 16, marginBottom: 16 }]}>
              <Feather name="search" size={16} color={colors.mutedForeground} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search products..."
                placeholderTextColor={colors.mutedForeground}
                style={[styles.searchInput, { color: colors.foreground }]}
              />
            </View>
          </>
        }
        renderItem={({ item }) => (
          <Pressable
            style={[styles.productCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => openEdit(item)}
            onLongPress={() => confirmDelete(item)}
          >
            {item.thumbnailPath ? (
              <Image source={{ uri: item.thumbnailPath }} style={styles.productThumb} contentFit="cover" />
            ) : (
              <View style={[styles.productThumb, { backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }]}>
                <Feather name="package" size={28} color="#C06070" />
              </View>
            )}
            <View style={styles.productInfo}>
              <Text style={[styles.productName, { color: colors.foreground }]} numberOfLines={2}>{item.name}</Text>
              {item.category ? <Text style={[styles.productCat, { color: colors.mutedForeground }]}>{item.category}</Text> : null}
              {item.defaultPrice ? <Text style={[styles.productPrice, { color: '#C06070' }]}>${item.defaultPrice}</Text> : null}
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="package" size={48} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No products</Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              Products are added automatically when you create orders, or add them manually.
            </Text>
          </View>
        }
      />

      <Pressable
        onPress={openAdd}
        style={[styles.fab, { backgroundColor: colors.primary, bottom: (Platform.OS === 'web' ? 34 : insets.bottom) + 80 }]}
      >
        <Feather name="plus" size={26} color={colors.primaryForeground} />
      </Pressable>

      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Pressable onPress={() => setModalVisible(false)}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </Pressable>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {editing ? 'Edit Product' : 'New Product'}
            </Text>
            <Pressable onPress={handleSave} disabled={saving || !name.trim()}>
              <Text style={[styles.saveText, { color: name.trim() ? '#C06070' : colors.mutedForeground }]}>Save</Text>
            </Pressable>
          </View>

          <View style={styles.modalBody}>
            <Pressable onPress={pickImage} style={[styles.imagePickerBtn, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {imageUri ? (
                <Image source={{ uri: imageUri }} style={styles.modalImage} contentFit="cover" />
              ) : (
                <>
                  <Feather name="camera" size={24} color={colors.mutedForeground} />
                  <Text style={[styles.imagePickerText, { color: colors.mutedForeground }]}>Add Photo</Text>
                </>
              )}
            </Pressable>

            {[
              { label: 'Product Name *', value: name, onChange: setName, placeholder: 'e.g. Custom Tote Bag' },
              { label: 'Category', value: category, onChange: setCategory, placeholder: 'e.g. Bags, Jewelry...' },
              { label: 'Default Price', value: price, onChange: setPrice, placeholder: '0.00', keyboardType: 'decimal-pad' },
            ].map(f => (
              <View key={f.label} style={styles.field}>
                <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{f.label}</Text>
                <TextInput
                  value={f.value}
                  onChangeText={f.onChange}
                  placeholder={f.placeholder}
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType={(f as any).keyboardType || 'default'}
                  style={[styles.fieldInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
                />
              </View>
            ))}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingBottom: 12 },
  title: { fontSize: 28, fontFamily: 'Inter_700Bold', flex: 1 },
  count: { fontSize: 16, fontFamily: 'Inter_500Medium' },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  searchInput: { flex: 1, fontSize: 15, fontFamily: 'Inter_400Regular' },
  productCard: { flex: 1, borderRadius: 14, borderWidth: 1, overflow: 'hidden', marginBottom: 12 },
  productThumb: { width: '100%', aspectRatio: 1 },
  productInfo: { padding: 10, gap: 3 },
  productName: { fontSize: 14, fontFamily: 'Inter_600SemiBold', lineHeight: 18 },
  productCat: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  productPrice: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  empty: { alignItems: 'center', paddingTop: 64, gap: 12, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 20, fontFamily: 'Inter_600SemiBold' },
  emptyText: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 20 },
  fab: {
    position: 'absolute', right: 20, width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8 }, android: { elevation: 6 } }),
  },
  modalContainer: { flex: 1 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingTop: 24, borderBottomWidth: StyleSheet.hairlineWidth },
  modalTitle: { fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  saveText: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  modalBody: { padding: 20, gap: 16 },
  imagePickerBtn: { height: 140, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 8, overflow: 'hidden' },
  modalImage: { width: '100%', height: '100%' },
  imagePickerText: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  field: { gap: 6 },
  fieldLabel: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  fieldInput: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: 'Inter_400Regular' },
});
