export type OrderSource = 'Instagram' | 'Facebook' | 'WhatsApp' | 'Website' | 'Email' | 'Manual';
export type PaymentStatus = 'Unpaid' | 'Partial' | 'Paid';
export type OrderStatus = 'Confirmed' | 'Shipped' | 'Delivered';

export interface OrderItem {
  id: string;
  productId?: string;
  productName: string;
  size?: string;
  price: number;
  quantity: number;
  imagePath?: string;
  thumbnailPath?: string;
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
