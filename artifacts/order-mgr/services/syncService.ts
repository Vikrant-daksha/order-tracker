import { Customer, Order, OrderItem } from '@/types';
import {
  CreateOrderPayload,
  SyncCustomerData,
  SyncOrderData,
  SyncOrderItem,
  UpdateOrderPayload,
} from '@/types/sync';
import {
  createOnlineOrder,
  extractOrderItemFullImages,
  updateOnlineOrder,
  uploadProductImages,
} from './syncApi';

export interface SyncResult {
  success: boolean;
  onlineId?: string;
  error?: string;
}

export interface SyncProgressUpdate {
  isSyncing: boolean;
  totalBatch: number;
  completedBatch: number;
  currentOrderName?: string;
}

/**
 * Transforms an OrderItem into a SyncOrderItem.
 * Processes full-size images sequentially to minimize RAM usage.
 */
async function prepareSyncItem(item: OrderItem): Promise<SyncOrderItem> {
  const fullImages = extractOrderItemFullImages(item);
  let cloudinaryUrls: string[] = [];

  if (fullImages.length > 0) {
    try {
      cloudinaryUrls = await uploadProductImages(item.productName, fullImages);
    } catch (err: any) {
      console.warn(`[syncService] Image upload failed for item "${item.productName}":`, err?.message);
      cloudinaryUrls = fullImages.filter((p) => /^https?:\/\//i.test(p));
    }
  }

  return {
    id: item.id,
    productId: item.productId,
    productName: item.productName,
    size: item.size || undefined,
    price: item.price,
    quantity: item.quantity,
    isCustom: Boolean(item.isCustom),
    imagePaths: cloudinaryUrls,
  };
}

/**
 * Transforms Customer information into SyncCustomerData.
 * - Separates Instagram handle, Phone number, and Email so they never collide.
 * - Customer images are no longer uploaded or sent to the backend.
 */
async function prepareSyncCustomer(
  order: Order,
  customer?: Customer | null
): Promise<SyncCustomerData> {
  let phone = customer?.phone?.trim() || undefined;
  let instagram = (customer?.igHandle?.trim() || '').replace(/^@/, '') || undefined;
  let email = customer?.email?.trim() || undefined;

  // If customer is missing specific contact info, safely parse from order.contactInfo
  if (order.contactInfo && (!phone || !instagram || !email)) {
    const parts = order.contactInfo.split('\n').map((p) => p.trim()).filter(Boolean);
    for (const part of parts) {
      if (part.includes('@') && part.includes('.')) {
        if (!email) email = part;
      } else if (/^\+?[0-9\s\-()]{7,}$/.test(part) && !/[a-zA-Z]/.test(part)) {
        if (!phone) phone = part;
      } else if (part.startsWith('@') || /^[a-zA-Z0-9._]+$/.test(part)) {
        if (!instagram) instagram = part.replace(/^@/, '');
      }
    }
  }

  // Normalize phone if it mistakenly holds an Instagram handle
  if (phone) {
    if (phone.startsWith('@') || /^[a-zA-Z._]+$/.test(phone)) {
      if (!instagram) instagram = phone.replace(/^@/, '');
      phone = undefined;
    }
  }

  // Normalize instagram if it mistakenly holds a phone number
  if (instagram) {
    if (/^\+?[0-9\s\-()]{7,}$/.test(instagram) && !/[a-zA-Z]/.test(instagram)) {
      if (!phone) phone = instagram;
      instagram = undefined;
    }
  }

  // Disambiguate if phone and instagram have the exact same value
  if (phone && instagram && phone.toLowerCase() === instagram.toLowerCase()) {
    if (/^\+?[0-9\s\-()]{7,}$/.test(phone) && !/[a-zA-Z]/.test(phone)) {
      instagram = undefined;
    } else {
      instagram = phone.replace(/^@/, '');
      phone = undefined;
    }
  }

  return {
    name: customer?.name || order.customerName,
    address: customer?.address || order.address || '',
    email: email || undefined,
    phone: phone || undefined,
    instagram: instagram || undefined,
    note: customer?.notes || undefined,
    size: customer?.size || order.size || undefined,
  };
}

/**
 * Transforms an Order into SyncOrderData.
 * Uses Promise.all to prepare and upload items concurrently.
 * Contact info is strictly omitted (belongs to Customer).
 */
async function prepareSyncOrder(order: Order): Promise<SyncOrderData> {
  let syncedItems: SyncOrderItem[] = [];

  if (order.items && order.items.length > 0) {
    syncedItems = await Promise.all(order.items.map((it) => prepareSyncItem(it)));
  } else if (order.customName || order.productId) {
    const legacyItem: OrderItem = {
      id: `legacy-${order.id}`,
      productId: order.productId,
      productName: order.customName || 'Custom Product',
      size: order.size,
      price: order.price,
      quantity: 1,
      imagePath: order.referenceImagePath,
      sizeImagePath: order.sizeImagePath,
      sizeImagePaths: order.sizeImagePaths,
      isCustom: Boolean(order.isCustom),
    };
    const prepared = await prepareSyncItem(legacyItem);
    syncedItems.push(prepared);
  }

  return {
    source: order.source || 'Manual',
    customerName: order.customerName,
    address: order.address || '',
    orderDate: order.orderDate ? new Date(order.orderDate).toISOString() : new Date().toISOString(),
    dueDate: order.dueDate ? new Date(order.dueDate).toISOString() : new Date().toISOString(),
    price: order.price,
    amountPaid: order.amountPaid,
    paymentStatus: order.paymentStatus,
    status: order.status,
    trackingLink: order.trackingLink || undefined,
    notes: order.notes || undefined,
    isCustom: order.isCustom ? 1 : 0,
    items: syncedItems,
  };
}

/**
 * Synchronizes a single order with the remote MongoDB API.
 */
export async function syncSingleOrder(
  order: Order,
  customer?: Customer | null,
  updateLocalOrder?: (id: string, updates: Partial<Order>) => Promise<void>
): Promise<SyncResult> {
  if (!order || !order.id) {
    return { success: false, error: 'Invalid order' };
  }

  if (updateLocalOrder) {
    await updateLocalOrder(order.id, { syncStatus: 'SYNCING', syncError: '' });
  }

  try {
    const syncCustomer = await prepareSyncCustomer(order, customer);
    const syncOrder = await prepareSyncOrder(order);

    if (!order.onlineId) {
      const payload: CreateOrderPayload = {
        customerData: syncCustomer,
        orderData: syncOrder,
      };

      const result = await createOnlineOrder(payload);

      if (result.success && result.id) {
        if (updateLocalOrder) {
          await updateLocalOrder(order.id, {
            onlineId: result.id,
            syncStatus: 'SYNCED',
            lastSyncedAt: new Date().toISOString(),
            syncError: '',
          });
        }
        return { success: true, onlineId: result.id };
      } else {
        const errorMsg = result.error || 'Failed to create order on server';
        if (updateLocalOrder) {
          await updateLocalOrder(order.id, {
            syncStatus: 'PENDING',
            syncError: errorMsg,
          });
        }
        return { success: false, error: errorMsg };
      }
    } else {
      const payload: UpdateOrderPayload = {
        orderData: syncOrder,
        customerData: syncCustomer,
      };

      const result = await updateOnlineOrder(order.onlineId, payload);

      if (result.success) {
        if (updateLocalOrder) {
          await updateLocalOrder(order.id, {
            syncStatus: 'SYNCED',
            lastSyncedAt: new Date().toISOString(),
            syncError: '',
          });
        }
        return { success: true, onlineId: order.onlineId };
      } else {
        const errorMsg = result.error || `Failed to update order ${order.onlineId}`;
        if (updateLocalOrder) {
          await updateLocalOrder(order.id, {
            syncStatus: 'PENDING',
            syncError: errorMsg,
          });
        }
        return { success: false, error: errorMsg };
      }
    }
  } catch (error: any) {
    const errorMsg = error?.message || 'Unexpected sync error';
    console.error(`[syncService] Error syncing order ${order.id}:`, error);
    if (updateLocalOrder) {
      await updateLocalOrder(order.id, {
        syncStatus: 'PENDING',
        syncError: errorMsg,
      });
    }
    return { success: false, error: errorMsg };
  }
}

/**
 * A FIFO Serial Queue ensuring ONLY ONE order is synchronized at a time.
 * Prevents concurrent memory spikes and yields between jobs so Hermes/V8 can garbage-collect.
 */
class SerialSyncQueue {
  private queue: string[] = [];
  private queuedSet = new Set<string>();
  private activeId: string | null = null;
  private isProcessing = false;
  private totalBatch = 0;
  private completedBatch = 0;
  private progressListener?: (update: SyncProgressUpdate) => void;

  public setProgressListener(listener: (update: SyncProgressUpdate) => void) {
    this.progressListener = listener;
  }

  public enqueue(
    orderIds: string[],
    worker: (id: string) => Promise<SyncResult>,
    orderNameGetter?: (id: string) => string | undefined
  ) {
    // If the queue was completely idle, reset batch counters to start a fresh batch
    if (!this.isProcessing && this.queue.length === 0) {
      this.totalBatch = 0;
      this.completedBatch = 0;
    }

    let addedCount = 0;
    for (const id of orderIds) {
      // Never re-enqueue if already in queue or currently being processed
      if (!this.queuedSet.has(id) && id !== this.activeId) {
        this.queuedSet.add(id);
        this.queue.push(id);
        addedCount++;
      }
    }

    if (addedCount > 0) {
      this.totalBatch += addedCount;
      this.emitProgress(true);
    }

    this.processNext(worker, orderNameGetter);
  }

  private async processNext(
    worker: (id: string) => Promise<SyncResult>,
    orderNameGetter?: (id: string) => string | undefined
  ) {
    if (this.isProcessing) return;

    if (this.queue.length === 0) {
      this.isProcessing = false;
      this.activeId = null;
      this.totalBatch = 0;
      this.completedBatch = 0;
      this.emitProgress(false);
      return;
    }

    this.isProcessing = true;
    const nextId = this.queue.shift()!;
    this.queuedSet.delete(nextId);
    this.activeId = nextId;

    const currentName = orderNameGetter ? orderNameGetter(nextId) : undefined;
    this.emitProgress(true, currentName);

    try {
      await worker(nextId);
    } catch (err) {
      console.error('[SerialSyncQueue] Worker error on order:', nextId, err);
    } finally {
      this.completedBatch++;
      this.activeId = null;
      this.isProcessing = false;

      if (this.queue.length === 0) {
        this.totalBatch = 0;
        this.completedBatch = 0;
        this.emitProgress(false);
      } else {
        this.emitProgress(true);
        // Yield 50ms so JavaScript runtime can GC the previous order's memory
        setTimeout(() => {
          this.processNext(worker, orderNameGetter);
        }, 50);
      }
    }
  }

  private emitProgress(isSyncing: boolean, currentOrderName?: string) {
    if (this.progressListener) {
      this.progressListener({
        isSyncing,
        totalBatch: this.totalBatch,
        completedBatch: this.completedBatch,
        currentOrderName,
      });
    }
  }

  public getStatus() {
    return {
      isSyncing: this.isProcessing || this.queue.length > 0,
      queueLength: this.queue.length,
      totalBatch: this.totalBatch,
      completedBatch: this.completedBatch,
    };
  }
}

export const serialSyncQueue = new SerialSyncQueue();
