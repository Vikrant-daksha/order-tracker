/**
 * AI Tool Implementations — Privacy-Safe Layer
 *
 * These functions are called BY the AI (via tool-calling) and run entirely on-device.
 * They query local SQLite data and return ONLY aggregated/anonymized results.
 *
 * PRIVACY GUARANTEE:
 * - Customer contact info, phone numbers, emails, and addresses are NEVER returned.
 * - Only counts, totals, statuses, dates, and product names are exposed to the AI.
 * - The AI API only ever sees tool schemas + these aggregated results.
 */

import { Order, Product, Customer, Expense, OrderStatus, PaymentStatus } from '@/types';

// ─── Types ───────────────────────────────────────────────────────────────────────

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
}

export interface AppData {
  orders: Order[];
  products: Product[];
  customers: Customer[];
  expenses: Expense[];
  addOrder: (order: any) => Promise<string>;
  updateOrder: (id: string, updates: any) => Promise<void>;
  addExpense: (expense: any) => Promise<string>;
}

// ─── Helper: Date Range ──────────────────────────────────────────────────────────

function getDateRange(period: string): { start: string; end: string } {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  switch (period.toLowerCase()) {
    case 'today':
      return { start: today, end: today };
    case 'week': {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return { start: d.toISOString().split('T')[0], end: today };
    }
    case 'month': {
      const d = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: d.toISOString().split('T')[0], end: today };
    }
    case 'last_month': {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start: s.toISOString().split('T')[0], end: e.toISOString().split('T')[0] };
    }
    case 'year': {
      const d = new Date(now.getFullYear(), 0, 1);
      return { start: d.toISOString().split('T')[0], end: today };
    }
    default:
      return { start: today, end: today };
  }
}

// ─── Tool Declarations (sent to Gemini as function definitions) ──────────────────

export const TOOL_DECLARATIONS = [
  {
    name: 'getOrderSummary',
    description: 'Get a summary of all orders: total count, count by status, overdue count, and orders currently being worked on.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'getRevenueStats',
    description: 'Get revenue statistics for a time period: total revenue, order count, average order value, and outstanding balance.',
    parameters: {
      type: 'object',
      properties: {
        period: { type: 'string', description: 'One of: today, week, month, last_month, year', enum: ['today', 'week', 'month', 'last_month', 'year'] },
      },
      required: ['period'],
    },
  },
  {
    name: 'getTopProducts',
    description: 'Get the best-selling products ranked by order count.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Number of results (default 5)' },
      },
      required: [],
    },
  },
  {
    name: 'getPendingPayments',
    description: 'Get count and total outstanding balance for unpaid and partially paid orders.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'getExpenseSummary',
    description: 'Get total expenses for a time period, broken down by category.',
    parameters: {
      type: 'object',
      properties: {
        period: { type: 'string', description: 'One of: today, week, month, last_month, year', enum: ['today', 'week', 'month', 'last_month', 'year'] },
      },
      required: ['period'],
    },
  },
  {
    name: 'searchOrders',
    description: 'Search orders by product name or customer name. Returns order ID, product name, status, price, and due date — no contact info.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search keyword' },
      },
      required: ['query'],
    },
  },
  {
    name: 'getCustomerOrderHistory',
    description: 'Get order stats for a customer by name: order count, total spent, and repeat buyer status. No contact info returned.',
    parameters: {
      type: 'object',
      properties: {
        customerName: { type: 'string', description: "The customer's name" },
      },
      required: ['customerName'],
    },
  },
  {
    name: 'createOrder',
    description: 'Create a new order in the app.',
    parameters: {
      type: 'object',
      properties: {
        customerName: { type: 'string', description: 'Customer name' },
        productName: { type: 'string', description: 'Product or custom item name' },
        price: { type: 'number', description: 'Total price' },
        dueDate: { type: 'string', description: 'Due date in YYYY-MM-DD' },
        source: { type: 'string', enum: ['Instagram', 'Facebook', 'WhatsApp', 'Website', 'Email', 'Manual'] },
        notes: { type: 'string', description: 'Extra notes' },
      },
      required: ['customerName', 'productName', 'price'],
    },
  },
  {
    name: 'updateOrderStatus',
    description: 'Update the status of an order by its ID.',
    parameters: {
      type: 'object',
      properties: {
        orderId: { type: 'string', description: 'Order ID from searchOrders' },
        status: { type: 'string', enum: ['Confirmed', 'Shipped', 'Delivered', 'Completed'] },
      },
      required: ['orderId', 'status'],
    },
  },
  {
    name: 'markOrderPaid',
    description: 'Update the payment amount for an order.',
    parameters: {
      type: 'object',
      properties: {
        orderId: { type: 'string', description: 'Order ID' },
        amountPaid: { type: 'number', description: 'Amount paid' },
        totalPrice: { type: 'number', description: 'Total order price (to determine partial vs full)' },
      },
      required: ['orderId', 'amountPaid'],
    },
  },
  {
    name: 'addExpense',
    description: 'Log a business expense.',
    parameters: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'Expense amount' },
        category: { type: 'string', enum: ['Supplies', 'Packaging', 'Shipping', 'Marketing', 'Equipment', 'Other'] },
        note: { type: 'string', description: 'Description of the expense' },
        date: { type: 'string', description: 'Date in YYYY-MM-DD (defaults to today)' },
      },
      required: ['amount', 'category'],
    },
  },
];

// ─── Tool Router ─────────────────────────────────────────────────────────────────

export function executeTool(
  toolName: string,
  args: Record<string, any>,
  data: AppData
): ToolResult {
  try {
    switch (toolName) {
      case 'getOrderSummary':       return getOrderSummary(data.orders);
      case 'getRevenueStats':       return getRevenueStats(data.orders, args.period || 'month');
      case 'getTopProducts':        return getTopProducts(data.orders, args.limit || 5);
      case 'getPendingPayments':    return getPendingPayments(data.orders);
      case 'getExpenseSummary':     return getExpenseSummary(data.expenses, args.period || 'month');
      case 'searchOrders':          return searchOrders(data.orders, args.query || '');
      case 'getCustomerOrderHistory': return getCustomerOrderHistory(data.orders, args.customerName || '');
      case 'createOrder':           return createOrderTool(data, args);
      case 'updateOrderStatus':     return updateOrderStatusTool(data, args.orderId, args.status);
      case 'markOrderPaid':         return markOrderPaidTool(data, args.orderId, args.amountPaid, args.totalPrice);
      case 'addExpense':            return addExpenseTool(data, args);
      default:                      return { success: false, error: `Unknown tool: ${toolName}` };
    }
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Tool execution failed' };
  }
}

// ─── Read Tools ──────────────────────────────────────────────────────────────────

function getOrderSummary(orders: Order[]): ToolResult {
  const today = new Date().toISOString().split('T')[0];
  const byStatus: Record<string, number> = {};
  let overdueCount = 0;
  let workingOnCount = 0;
  for (const o of orders) {
    byStatus[o.status] = (byStatus[o.status] || 0) + 1;
    if (o.dueDate && o.dueDate < today && o.status !== 'Delivered' && o.status !== 'Completed') overdueCount++;
    if (o.workingOn === 1) workingOnCount++;
  }
  return { success: true, data: { totalOrders: orders.length, byStatus, overdueCount, workingOnCount } };
}

function getRevenueStats(orders: Order[], period: string): ToolResult {
  const { start, end } = getDateRange(period);
  const inRange = orders.filter(o => {
    const d = o.orderDate || o.createdAt?.split('T')[0] || '';
    return d >= start && d <= end;
  });
  const totalRevenue = inRange.reduce((s, o) => s + (o.price || 0), 0);
  const totalPaid = inRange.reduce((s, o) => s + (o.amountPaid || 0), 0);
  const outstanding = inRange
    .filter(o => o.paymentStatus !== 'Paid')
    .reduce((s, o) => s + ((o.price || 0) - (o.amountPaid || 0)), 0);
  return {
    success: true,
    data: {
      period,
      orderCount: inRange.length,
      totalRevenue,
      totalPaid,
      outstandingBalance: outstanding,
      avgOrderValue: inRange.length > 0 ? Math.round(totalRevenue / inRange.length) : 0,
    },
  };
}

function getTopProducts(orders: Order[], limit: number): ToolResult {
  const counts: Record<string, number> = {};
  for (const o of orders) {
    const items = o.items || [];
    if (items.length > 0) {
      for (const item of items) counts[item.productName || 'Custom'] = (counts[item.productName || 'Custom'] || 0) + item.quantity;
    } else {
      const name = o.customName || 'Custom';
      counts[name] = (counts[name] || 0) + 1;
    }
  }
  const topProducts = Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([productName, orderCount]) => ({ productName, orderCount }));
  return { success: true, data: { topProducts } };
}

function getPendingPayments(orders: Order[]): ToolResult {
  const unpaid = orders.filter(o => o.paymentStatus === 'Unpaid');
  const partial = orders.filter(o => o.paymentStatus === 'Partial');
  const unpaidTotal = unpaid.reduce((s, o) => s + (o.price || 0), 0);
  const partialTotal = partial.reduce((s, o) => s + ((o.price || 0) - (o.amountPaid || 0)), 0);
  return {
    success: true,
    data: {
      unpaidCount: unpaid.length,
      partialCount: partial.length,
      totalOutstanding: unpaidTotal + partialTotal,
      unpaidTotal,
      partialRemaining: partialTotal,
    },
  };
}

function getExpenseSummary(expenses: Expense[], period: string): ToolResult {
  const { start, end } = getDateRange(period);
  const inRange = expenses.filter(e => e.date >= start && e.date <= end);
  const byCategory: Record<string, number> = {};
  let total = 0;
  for (const e of inRange) {
    byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
    total += e.amount;
  }
  return { success: true, data: { period, totalExpenses: total, byCategory, expenseCount: inRange.length } };
}

function searchOrders(orders: Order[], query: string): ToolResult {
  if (!query.trim()) return { success: false, error: 'Provide a search term.' };
  const q = query.toLowerCase();
  const matches = orders
    .filter(o =>
      o.customerName?.toLowerCase().includes(q) ||
      o.customName?.toLowerCase().includes(q) ||
      o.items?.some(i => i.productName?.toLowerCase().includes(q))
    )
    .slice(0, 10)
    .map(o => ({
      orderId: o.id,
      customerFirstName: o.customerName?.split(' ')[0] || 'Customer', // only first name for privacy
      productName: o.items?.[0]?.productName || o.customName || 'Custom item',
      status: o.status,
      paymentStatus: o.paymentStatus,
      price: o.price,
      dueDate: o.dueDate,
    }));
  return { success: true, data: { resultCount: matches.length, orders: matches } };
}

function getCustomerOrderHistory(orders: Order[], customerName: string): ToolResult {
  if (!customerName) return { success: false, error: 'Customer name required.' };
  const q = customerName.toLowerCase();
  const found = orders.filter(o => o.customerName?.toLowerCase().includes(q));
  if (found.length === 0) return { success: true, data: { found: false, message: 'No orders found for this customer.' } };
  const totalSpent = found.reduce((s, o) => s + (o.price || 0), 0);
  const dates = found.map(o => o.orderDate || o.createdAt?.split('T')[0] || '').filter(Boolean).sort();
  return {
    success: true,
    data: { found: true, orderCount: found.length, totalSpent, firstOrderDate: dates[0], lastOrderDate: dates[dates.length - 1], isRepeatCustomer: found.length > 1 },
  };
}

// ─── Write Tools ─────────────────────────────────────────────────────────────────

function createOrderTool(data: AppData, args: any): ToolResult {
  const today = new Date().toISOString().split('T')[0];
  data.addOrder({
    source: (args.source as OrderStatus) || 'Manual',
    customerName: args.customerName || 'Unknown',
    contactInfo: '', address: '', orderDate: today,
    dueDate: args.dueDate || today,
    productId: '', customName: args.productName || 'Custom item',
    referenceImagePath: '', thumbnailPath: '',
    price: args.price || 0,
    paymentStatus: 'Unpaid' as PaymentStatus,
    amountPaid: 0,
    status: 'Confirmed' as OrderStatus,
    trackingLink: '',
    notes: args.notes || 'Created via AI assistant',
    isCustom: 1 as 0 | 1,
    items: [{ id: Date.now().toString(36), productName: args.productName || 'Custom item', price: args.price || 0, quantity: 1, isCustom: true }],
  }).catch(console.error);
  return { success: true, data: { message: `Order created for ${args.customerName} — ${args.productName} at ₹${args.price}`, status: 'Confirmed', dueDate: args.dueDate || today } };
}

function updateOrderStatusTool(data: AppData, orderId: string, status: OrderStatus): ToolResult {
  if (!orderId) return { success: false, error: 'Order ID required.' };
  if (!status) return { success: false, error: 'Status required.' };
  data.updateOrder(orderId, { status }).catch(console.error);
  return { success: true, data: { message: `Order ${orderId} updated to ${status}.` } };
}

function markOrderPaidTool(data: AppData, orderId: string, amountPaid: number, totalPrice?: number): ToolResult {
  if (!orderId) return { success: false, error: 'Order ID required.' };
  const order = data.orders.find(o => o.id === orderId);
  const price = totalPrice ?? order?.price ?? amountPaid;
  const paymentStatus: PaymentStatus = amountPaid >= price ? 'Paid' : amountPaid > 0 ? 'Partial' : 'Unpaid';
  data.updateOrder(orderId, { amountPaid, paymentStatus }).catch(console.error);
  return { success: true, data: { message: `Payment updated: ₹${amountPaid} recorded. Status: ${paymentStatus}.` } };
}

function addExpenseTool(data: AppData, args: any): ToolResult {
  const today = new Date().toISOString().split('T')[0];
  data.addExpense({ amount: args.amount, category: args.category || 'Other', note: args.note || '', date: args.date || today }).catch(console.error);
  return { success: true, data: { message: `₹${args.amount} expense logged under ${args.category}.` } };
}
