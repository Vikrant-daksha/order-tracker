export type OrderSource = 'Instagram' | 'Facebook' | 'WhatsApp' | 'Website' | 'Email' | 'Manual';
export type PaymentStatus = 'Unpaid' | 'Partial' | 'Paid';
export type OrderStatus = 'Confirmed' | 'Completed' | 'Shipped' | 'Delivered';

// Fixed default categories; custom ones are stored as plain strings
export type ExpenseCategory = 'Supplies' | 'Packaging' | 'Shipping' | 'Marketing' | 'Equipment' | 'Other' | string;

export interface Expense {
  id: string;
  amount: number;
  category: ExpenseCategory;
  note: string;
  /** YYYY-MM-DD — the day this expense was incurred (determines which week/month it belongs to) */
  date: string;
  createdAt: string; // ISO timestamp for sorting
}

export interface OrderItem {
  id: string;
  productId?: string;
  productName: string;
  size?: string;
  price: number;
  quantity: number;
  imagePath?: string;
  thumbnailPath?: string;
  imagePaths?: string[];
  thumbnailPaths?: string[];
  sizeImagePath?: string;
  sizeThumbnailPath?: string;
  sizeImagePaths?: string[];
  sizeThumbnailPaths?: string[];
  isCustom: boolean;
}

export interface Order {
  id: string;
  source: OrderSource;
  customerName: string;
  contactInfo: string;
  address: string;
  orderDate: string;
  dueDate: string;
  productId: string;
  customName: string;
  referenceImagePath: string;
  thumbnailPath: string;
  price: number;
  paymentStatus: PaymentStatus;
  amountPaid: number;
  status: OrderStatus;
  trackingLink: string;
  notes: string;
  createdAt: string;
  isCustom: number;
  size?: string;
  sizeImagePath?: string;
  sizeThumbnailPath?: string;
  sizeImagePaths?: string[];
  sizeThumbnailPaths?: string[];
  customerId?: string;
  workingOn?: number; // 1 = currently working on, 0 = not
  items?: OrderItem[];
}

export interface Product {
  id: string;
  name: string;
  imagePath: string;
  thumbnailPath: string;
  defaultPrice: number;
  category: string;
}

export interface Customer {
  id: string;
  name: string;
  igHandle: string;
  phone: string;
  email: string;
  address: string;
  createdAt: string;
}

export interface CustomerProfile extends Customer {
  totalOrders: number;
  totalSpent: number;
  lastOrderDate: string;
  isRepeat: boolean;
}
