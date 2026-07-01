import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React from 'react';
import { Dimensions, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import ImageZoom from 'react-native-image-pan-zoom';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const SafeImageZoom = ImageZoom as unknown as React.ComponentType<
  React.ComponentProps<typeof ImageZoom> & { children?: React.ReactNode }
>;

const { width: SW, height: SH } = Dimensions.get('window');

interface ImageViewerProps {
  visible: boolean;
  uri: string;
  onClose: () => void;
}

export function ImageViewer({ visible, uri, onClose }: ImageViewerProps) {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'ios' ? insets.top + 6 : 20;

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        {/* Top bar controls overlay */}
        <View style={[styles.topBar, { paddingTop: topPad }]} pointerEvents="box-none">
          <Pressable onPress={onClose} style={styles.iconBtn} hitSlop={14}>
            <Feather name="x" size={20} color="#fff" />
          </Pressable>
          <Text style={styles.hint} numberOfLines={1}>
            Pinch to zoom  ·  Double-tap to toggle zoom
          </Text>
          <View style={styles.rightPlaceholder} />
        </View>

        {/* High performance pure-JS image zoom container */}
        <View style={styles.gestureArea}>
          <SafeImageZoom
            cropWidth={SW}
            cropHeight={SH}
            imageWidth={SW}
            imageHeight={SH}
            minScale={1}
            maxScale={6}
            enableDoubleClickZoom={true}
          >
            <Image
              source={{ uri }}
              style={styles.image}
              contentFit="contain"
            />
          </SafeImageZoom>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  gestureArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: SW,
    height: SH,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingBottom: 14,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(255,255,255,0.5)',
    marginHorizontal: 8,
  },
  rightPlaceholder: {
    width: 38,
  },
});
