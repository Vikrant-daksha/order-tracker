import { OrderSource, PaymentStatus, OrderStatus } from './index';

export type SyncStatus = 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED';

// 1. Child Item Interface for Sync
export interface SyncOrderItem {
  id: string;
  productId?: string;
  productName: string;
  size?: string;
  price: number;
  quantity: number;
  isCustom: boolean;
  imagePaths?: string[]; // Cloudinary URLs (full size only)
}

// 2. Customer Payload for Sync
export interface SyncCustomerData {
  name: string;
  address: string;
  email?: string;
  phone?: string;
  instagram?: string; // Note: In frontend Customer it is 'igHandle', map igHandle -> instagram
  note?: string;      // Note: In frontend Customer it is 'notes', map notes -> note
  size?: string;
  sizeImagePaths?: string[];
}

// 3. Order Payload for Sync (contact info belongs strictly to Customer)
export interface SyncOrderData {
  source: OrderSource;
  customerName: string;
  address: string;
  orderDate: string; // ISO string: new Date().toISOString()
  dueDate: string;   // ISO string
  price: number;
  amountPaid: number;
  paymentStatus: PaymentStatus;
  status: OrderStatus;
  trackingLink?: string;
  notes?: string;
  isCustom: number;  // 0 = standard items exist, 1 = bespoke
  items?: SyncOrderItem[];
}

// 4. POST /api/create-orders Request Body
export interface CreateOrderPayload {
  customerData: SyncCustomerData;
  orderData: SyncOrderData;
}

// 5. PUT /api/update-order/:id Request Body
export interface UpdateOrderPayload {
  orderData?: Partial<SyncOrderData>;
  customerData?: Partial<SyncCustomerData>;
}

// 6. API Responses
export interface CreateOrderResponse {
  success: boolean;
  id?: string;
  error?: string;
}

export interface UpdateOrderResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface UploadImagesResponse {
  success: boolean;
  imageUrls?: string[];
  customerId?: string;
  productName?: string;
  error?: string;
}

// 7. Internal Sync Queue Record
export interface SyncQueueItem {
  id: string;
  localOrderId: string;
  action: 'CREATE' | 'UPDATE';
  status: SyncStatus;
  retryCount: number;
  lastAttempt?: string;
  error?: string;
  createdAt: string;
}

