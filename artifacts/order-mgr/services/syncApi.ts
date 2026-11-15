import {
  CreateOrderPayload,
  CreateOrderResponse,
  UpdateOrderPayload,
  UpdateOrderResponse,
  UploadImagesResponse,
} from '@/types/sync';
import { Customer, OrderItem } from '@/types';
import { apiFetch } from './apiClient';

export const API_BASE_URL = 'https://order-tracker-vert.vercel.app/api';

/**
 * Checks if running specifically in React Native mobile environment
 */
function isReactNativeEnv(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    (navigator as any).product === 'ReactNative'
  );
}

/**
 * Checks if an image URI is already a hosted online URL (e.g. Cloudinary)
 */
export function isRemoteUrl(uri: string): boolean {
  return /^https?:\/\//i.test(uri);
}

/**
 * Filters out thumbnail references and extracts ONLY full-size image paths.
 * Whitelisted fields: imagePath, imagePaths, sizeImagePath, sizeImagePaths.
 * Ignores: thumbnailPath, thumbnailPaths, sizeThumbnailPath, sizeThumbnailPaths.
 */
export function extractOrderItemFullImages(item: OrderItem): string[] {
  const candidates: (string | undefined)[] = [
    item.imagePath,
    ...(item.imagePaths || []),
    item.sizeImagePath,
    ...(item.sizeImagePaths || []),
  ];

  const unique = Array.from(
    new Set(
      candidates.filter(
        (uri): uri is string => Boolean(uri && typeof uri === 'string' && uri.trim() !== '')
      )
    )
  );

  return unique;
}

/**
 * Extracts ONLY full-size customer reference images.
 * Whitelisted: sizeImagePath, sizeImagePaths.
 * Ignores: sizeThumbnailPath, sizeThumbnailPaths.
 */
export function extractCustomerFullImages(customer?: Customer | null): string[] {
  if (!customer) return [];
  const candidates: (string | undefined)[] = [
    customer.sizeImagePath,
    ...(customer.sizeImagePaths || []),
  ];

  const unique = Array.from(
    new Set(
      candidates.filter(
        (uri): uri is string => Boolean(uri && typeof uri === 'string' && uri.trim() !== '')
      )
    )
  );

  return unique;
}

/**
 * Prepares FormData with image files across React Native and Web platforms
 */
async function appendImagesToFormData(formData: FormData, uris: string[]) {
  for (let i = 0; i < uris.length; i++) {
    const uri = uris[i];
    const filename = uri.split('/').pop() || `image_${Date.now()}_${i}.jpg`;
    const extension = filename.split('.').pop()?.toLowerCase();
    const mimeType =
      extension === 'png'
        ? 'image/png'
        : extension === 'webp'
        ? 'image/webp'
        : 'image/jpeg';

    if (isReactNativeEnv()) {
      // React Native expects an object with uri, name, and type
      formData.append('images', {
        uri,
        name: filename,
        type: mimeType,
      } as any);
    } else if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
      try {
        const response = await fetch(uri);
        const blob = await response.blob();
        formData.append('images', blob, filename);
      } catch (err) {
        console.warn(`[syncApi] Web blob fetch failed for ${uri}:`, err);
      }
    } else {
      // Fallback (Node / testing environment)
      formData.append('images', {
        uri,
        name: filename,
        type: mimeType,
      } as any);
    }
  }
}

/**
 * Uploads a single customer image in its own atomic request.
 * Keeps individual request payloads tiny so Vercel/serverless never cuts them off.
 */
async function uploadSingleCustomerImage(
  customerId: string,
  uri: string
): Promise<string> {
  const formData = new FormData();
  formData.append('customerId', customerId || 'general');
  await appendImagesToFormData(formData, [uri]);

  const response = await apiFetch('/upload-customer-images', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to upload customer image: ${response.status} - ${errText}`);
  }

  const data: UploadImagesResponse = await response.json();
  return data.imageUrls?.[0] || '';
}

/**
 * Uploads full-size customer images to Cloudinary via POST /api/upload-customer-images.
 * Uses Promise.all to upload images concurrently with small, safe payloads.
 * Skips images that are already hosted online.
 */
export async function uploadCustomerImages(
  customerId: string,
  imageUris: string[]
): Promise<string[]> {
  if (!imageUris || imageUris.length === 0) return [];

  const remoteUrls: string[] = [];
  const localUris: string[] = [];

  for (const uri of imageUris) {
    if (isRemoteUrl(uri)) {
      remoteUrls.push(uri);
    } else {
      localUris.push(uri);
    }
  }

  if (localUris.length === 0) {
    return remoteUrls;
  }

  try {
    const uploadedUrls = await Promise.all(
      localUris.map((uri) => uploadSingleCustomerImage(customerId, uri))
    );
    return [...remoteUrls, ...uploadedUrls.filter(Boolean)];
  } catch (error: any) {
    console.error('[syncApi] uploadCustomerImages error:', error);
    throw error;
  }
}

/**
 * Uploads a single product image in its own atomic request.
 * Keeps individual request payloads tiny so Vercel/serverless never cuts them off.
 */
async function uploadSingleProductImage(
  productName: string,
  uri: string
): Promise<string> {
  const formData = new FormData();
  formData.append('productName', productName);
  await appendImagesToFormData(formData, [uri]);

  const response = await apiFetch('/upload-product-images', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to upload product image: ${response.status} - ${errText}`);
  }

  const data: UploadImagesResponse = await response.json();
  return data.imageUrls?.[0] || '';
}

/**
 * Uploads full-size product item images to Cloudinary via POST /api/upload-product-images.
 * Uses Promise.all to upload images concurrently with small, safe payloads.
 * Skips images that are already hosted online.
 */
export async function uploadProductImages(
  productName: string,
  imageUris: string[]
): Promise<string[]> {
  if (!imageUris || imageUris.length === 0) return [];

  const remoteUrls: string[] = [];
  const localUris: string[] = [];

  for (const uri of imageUris) {
    if (isRemoteUrl(uri)) {
      remoteUrls.push(uri);
    } else {
      localUris.push(uri);
    }
  }

  if (localUris.length === 0) {
    return remoteUrls;
  }

  try {
    const safeProductName = (productName && productName.trim()) ? productName.trim() : 'custom_order';
    const uploadedUrls = await Promise.all(
      localUris.map((uri) => uploadSingleProductImage(safeProductName, uri))
    );
    return [...remoteUrls, ...uploadedUrls.filter(Boolean)];
  } catch (error: any) {
    console.error('[syncApi] uploadProductImages error:', error);
    throw error;
  }
}

/**
 * Creates an order atomically in MongoDB via POST /api/create-orders.
 * Returns the remote online ID (e.g. CHERRYBRUSH...).
 */
export async function createOnlineOrder(payload: CreateOrderPayload): Promise<CreateOrderResponse> {
  try {
    const response = await apiFetch('/create-orders', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (response.status === 413) {
      return { success: false, error: 'HTTP 413: Payload Too Large' };
    }

    let data: CreateOrderResponse;
    try {
      data = await response.json();
    } catch {
      return {
        success: false,
        error: `HTTP ${response.status}: Request failed or payload cut off`,
      };
    }

    if (!response.ok || !data.success) {
      const message = data.error || `HTTP ${response.status}: Failed to create order`;
      return { success: false, error: message };
    }

    return {
      success: true,
      id: data.id,
    };
  } catch (error: any) {
    console.error('[syncApi] createOnlineOrder error:', error);
    return {
      success: false,
      error: error?.message || 'Network request failed',
    };
  }
}

/**
 * Partially updates an order and/or customer in MongoDB via PUT /api/update-order/:id.
 */
export async function updateOnlineOrder(
  onlineId: string,
  payload: UpdateOrderPayload
): Promise<UpdateOrderResponse> {
  try {
    const response = await apiFetch(`/update-order/${encodeURIComponent(onlineId)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });

    if (response.status === 413) {
      return { success: false, error: 'HTTP 413: Payload Too Large' };
    }

    let data: UpdateOrderResponse;
    try {
      data = await response.json();
    } catch {
      return {
        success: false,
        error: `HTTP ${response.status}: Request failed or payload cut off`,
      };
    }

    if (!response.ok || !data.success) {
      const message = data.error || `HTTP ${response.status}: Failed to update order`;
      return { success: false, error: message };
    }

    return {
      success: true,
      message: data.message || `Order ${onlineId} updated`,
    };
  } catch (error: any) {
    console.error('[syncApi] updateOnlineOrder error:', error);
    return {
      success: false,
      error: error?.message || 'Network request failed',
    };
  }
}

/**
 * Searches an order by ID in the remote online database via GET /api/order/:id.
 * Used during reconciliation to check if an order was deleted in the online DB.
 * Returns { exists: true } if found and active, or { exists: false } if missing/deleted.
 */
export async function searchOnlineOrderById(
  onlineId: string
): Promise<{ exists: boolean; order?: any }> {
  try {
    const response = await apiFetch(`/order/${encodeURIComponent(onlineId)}`, {
      method: 'GET',
    });

    if (response.status === 404) {
      return { exists: false };
    }

    if (!response.ok) {
      return { exists: false };
    }

    const data = await response.json();
    if (data.success && data.order && !data.order.deleted) {
      return { exists: true, order: data.order };
    }

    return { exists: false };
  } catch (error: any) {
    console.error(`[syncApi] searchOnlineOrderById error for ${onlineId}:`, error);
    // On network failure or offline, preserve existing status
    return { exists: true };
  }
}


