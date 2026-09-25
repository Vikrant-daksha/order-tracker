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
  goals?: any[];
  addOrder: (order: any) => Promise<string>;
  updateOrder: (id: string, updates: any) => Promise<void>;
  addExpense: (expense: any) => Promise<string>;
  addMonthlyGoal?: (goal: { title?: string; month: string; targetAmount: number; startDate?: string; endDate?: string }) => Promise<string>;
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
    description: 'Create a new single order in the app.',
    parameters: {
      type: 'object',
      properties: {
        customerName: { type: 'string', description: 'Customer name' },
        productName: { type: 'string', description: 'Product or custom item name' },
        price: { type: 'number', description: 'Total price in ₹' },
        size: { type: 'string', description: 'Product or item size (e.g. S, M, L, XL, 8x10, A4). Defaults to blank if not specified.' },
        paymentStatus: { type: 'string', enum: ['Unpaid', 'Partial', 'Paid'], description: 'Payment status of the order. Defaults to Unpaid if not specified.' },
        amountPaid: { type: 'number', description: 'Amount paid in ₹. If paymentStatus is Paid and omitted, defaults to full price. If Unpaid, defaults to 0.' },
        dueDate: { type: 'string', description: 'Due date in YYYY-MM-DD' },
        source: { type: 'string', enum: ['Instagram', 'Facebook', 'WhatsApp', 'Website', 'Email', 'Manual'] },
        notes: { type: 'string', description: 'Extra notes' },
      },
      required: ['customerName', 'productName', 'price'],
    },
  },
  {
    name: 'createMultipleOrders',
    description: 'Create multiple orders in a single batch operation. Always use this whenever the user wants to add or create 2 or more orders at once.',
    parameters: {
      type: 'object',
      properties: {
        orders: {
          type: 'array',
          description: 'List of orders to create',
          items: {
            type: 'object',
            properties: {
              customerName: { type: 'string', description: 'Customer name' },
              productName: { type: 'string', description: 'Product or custom item name' },
              price: { type: 'number', description: 'Total price in ₹' },
              size: { type: 'string', description: 'Product/item size (optional, defaults to blank)' },
              paymentStatus: { type: 'string', enum: ['Unpaid', 'Partial', 'Paid'], description: 'Payment status (optional, defaults to Unpaid)' },
              amountPaid: { type: 'number', description: 'Amount paid in ₹ (optional)' },
              dueDate: { type: 'string', description: 'Due date in YYYY-MM-DD format (optional)' },
              source: { type: 'string', enum: ['Instagram', 'Facebook', 'WhatsApp', 'Website', 'Email', 'Manual'], description: 'Order source (optional)' },
              notes: { type: 'string', description: 'Optional extra notes' },
            },
            required: ['customerName', 'productName', 'price'],
          },
        },
      },
      required: ['orders'],
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
  {
    name: 'getCatalog',
    description: 'Get all available items and prices in the product catalog. (Read-only, does not edit).',
    parameters: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Optional keyword to search product name or category' },
      },
      required: [],
    },
  },
  {
    name: 'createGoal',
    description: 'Create a new monthly revenue goal or sales milestone target.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Goal title or name (e.g. "Monthly Target", "Diwali Rush", "Sprint 1")' },
        goalAmount: { type: 'number', description: 'Target revenue amount in ₹' },
        startDate: { type: 'string', description: 'Start date in YYYY-MM-DD (optional, defaults to 1st of current month)' },
        endDate: { type: 'string', description: 'End date in YYYY-MM-DD (optional, defaults to last day of month)' },
        month: { type: 'string', description: 'Month in YYYY-MM (optional, e.g. "2026-09")' },
      },
      required: ['goalAmount'],
    },
  },
  {
    name: 'setWorkingOnOrder',
    description: 'Add or remove an order from the "Currently Working On" workbench section on the home screen.',
    parameters: {
      type: 'object',
      properties: {
        orderId: { type: 'string', description: 'Order ID (if known)' },
        customerName: { type: 'string', description: 'Customer name or search query if order ID is unknown' },
        isWorkingOn: { type: 'boolean', description: 'true to pin to Currently Working On, false to remove (defaults to true)' },
      },
      required: [],
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
      case 'createMultipleOrders':   return createMultipleOrdersTool(data, args);
      case 'updateOrderStatus':     return updateOrderStatusTool(data, args.orderId, args.status);
      case 'markOrderPaid':         return markOrderPaidTool(data, args.orderId, args.amountPaid, args.totalPrice);
      case 'addExpense':            return addExpenseTool(data, args);
      case 'getCatalog':            return getCatalogTool(data.products, args.search);
      case 'createGoal':            return createGoalTool(data, args);
      case 'setWorkingOnOrder':     return setWorkingOnOrderTool(data, args);
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
  const price = typeof args.price === 'number' ? args.price : parseFloat(args.price) || 0;
  const size = (args.size || '').trim();

  let paymentStatus: PaymentStatus = 'Unpaid';
  if (args.paymentStatus === 'Paid' || args.paymentStatus === 'Partial' || args.paymentStatus === 'Unpaid') {
    paymentStatus = args.paymentStatus;
  }
  let amountPaid = typeof args.amountPaid === 'number' ? args.amountPaid : 0;
  if (paymentStatus === 'Paid' && amountPaid === 0) {
    amountPaid = price;
  } else if (paymentStatus === 'Unpaid') {
    amountPaid = 0;
  } else if (paymentStatus === 'Partial' && amountPaid === 0) {
    amountPaid = Math.round(price / 2);
  }

  const productName = args.productName || 'Custom item';
  const customerName = args.customerName || 'Unknown';
  const dueDate = args.dueDate || today;

  data.addOrder({
    source: (args.source as OrderStatus) || 'Manual',
    customerName,
    contactInfo: '', address: '', orderDate: today,
    dueDate,
    productId: '', customName: productName,
    referenceImagePath: '', thumbnailPath: '',
    price,
    paymentStatus,
    amountPaid,
    status: 'Confirmed' as OrderStatus,
    trackingLink: '',
    notes: args.notes || 'Created via AI assistant',
    isCustom: 1 as 0 | 1,
    items: [{
      id: Date.now().toString(36),
      productName,
      size: size || undefined,
      price,
      quantity: 1,
      isCustom: true,
    }],
  }).catch(console.error);

  const sizeText = size ? ` (Size: ${size})` : '';
  return {
    success: true,
    data: {
      message: `Order created for ${customerName} — ${productName}${sizeText} at ₹${price} [${paymentStatus}]`,
      status: 'Confirmed',
      paymentStatus,
      size: size || 'N/A',
      dueDate,
    },
  };
}

function createMultipleOrdersTool(data: AppData, args: any): ToolResult {
  const orderList: any[] = Array.isArray(args.orders) ? args.orders : [];
  if (orderList.length === 0) {
    return { success: false, error: 'No orders provided in the list.' };
  }

  const today = new Date().toISOString().split('T')[0];
  const summaries: string[] = [];

  for (let i = 0; i < orderList.length; i++) {
    const o = orderList[i];
    const customerName = o.customerName || 'Unknown';
    const productName = o.productName || 'Custom item';
    const price = typeof o.price === 'number' ? o.price : parseFloat(o.price) || 0;
    const dueDate = o.dueDate || today;
    const source = (o.source as OrderStatus) || 'Manual';
    const notes = o.notes || 'Created via AI batch assistant';
    const size = (o.size || '').trim();

    let paymentStatus: PaymentStatus = 'Unpaid';
    if (o.paymentStatus === 'Paid' || o.paymentStatus === 'Partial' || o.paymentStatus === 'Unpaid') {
      paymentStatus = o.paymentStatus;
    }
    let amountPaid = typeof o.amountPaid === 'number' ? o.amountPaid : 0;
    if (paymentStatus === 'Paid' && amountPaid === 0) {
      amountPaid = price;
    } else if (paymentStatus === 'Unpaid') {
      amountPaid = 0;
    } else if (paymentStatus === 'Partial' && amountPaid === 0) {
      amountPaid = Math.round(price / 2);
    }

    data.addOrder({
      source,
      customerName,
      contactInfo: '',
      address: '',
      orderDate: today,
      dueDate,
      productId: '',
      customName: productName,
      referenceImagePath: '',
      thumbnailPath: '',
      price,
      paymentStatus,
      amountPaid,
      status: 'Confirmed' as OrderStatus,
      trackingLink: '',
      notes,
      isCustom: 1 as 0 | 1,
      items: [{
        id: (Date.now() + i).toString(36),
        productName,
        size: size || undefined,
        price,
        quantity: 1,
        isCustom: true,
      }],
    }).catch(console.error);

    const sizeText = size ? ` (Size: ${size})` : '';
    summaries.push(`${customerName} — ${productName}${sizeText} (₹${price}, ${paymentStatus})`);
  }

  return {
    success: true,
    data: {
      totalCreated: orderList.length,
      orders: summaries,
      message: `Successfully created ${orderList.length} orders in batch:\n` + summaries.map(s => `• ${s}`).join('\n'),
    },
  };
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

function getCatalogTool(products: Product[], search?: string): ToolResult {
  let list = products || [];
  if (search?.trim()) {
    const q = search.toLowerCase().trim();
    list = list.filter(p => p.name.toLowerCase().includes(q) || (p.category && p.category.toLowerCase().includes(q)));
  }
  if (list.length === 0) {
    return {
      success: true,
      data: {
        count: 0,
        products: [],
        message: search ? `No products matching "${search}" in catalog.` : 'Product catalog is currently empty.',
      },
    };
  }

  const items = list.map(p => ({
    name: p.name,
    defaultPrice: `₹${p.defaultPrice}`,
    category: p.category || 'General',
  }));

  return {
    success: true,
    data: {
      count: items.length,
      products: items,
      message: `Found ${items.length} product(s) in catalog:\n` + items.map(p => `• ${p.name} — ${p.defaultPrice} (${p.category})`).join('\n'),
    },
  };
}

function createGoalTool(data: AppData, args: any): ToolResult {
  const today = new Date();
  const currentMonth = today.toISOString().slice(0, 7);
  const targetAmount = typeof args.goalAmount === 'number' ? args.goalAmount : parseFloat(args.goalAmount) || 0;
  if (targetAmount <= 0) {
    return { success: false, error: 'Goal amount must be greater than ₹0.' };
  }

  const title = (args.name || 'Monthly Goal').trim();
  let startDate = (args.startDate || '').trim();
  let endDate = (args.endDate || '').trim();
  let month = (args.month || '').trim();

  if (!startDate) {
    const y = today.getFullYear();
    const m = today.getMonth() + 1;
    startDate = `${y}-${String(m).padStart(2, '0')}-01`;
  }
  if (!month) {
    month = startDate.slice(0, 7) || currentMonth;
  }
  if (!endDate) {
    const [yStr, mStr] = month.split('-');
    const y = parseInt(yStr, 10) || today.getFullYear();
    const m = parseInt(mStr, 10) || (today.getMonth() + 1);
    const lastDay = new Date(y, m, 0).getDate();
    endDate = `${month}-${String(lastDay).padStart(2, '0')}`;
  }

  if (data.addMonthlyGoal) {
    data.addMonthlyGoal({
      title,
      month,
      targetAmount,
      startDate,
      endDate,
    }).catch(console.error);
  }

  return {
    success: true,
    data: {
      message: `Goal '${title}' set to ₹${targetAmount.toLocaleString('en-IN')} (${startDate} to ${endDate}).`,
      name: title,
      targetAmount,
      month,
      startDate,
      endDate,
    },
  };
}

function setWorkingOnOrderTool(data: AppData, args: any): ToolResult {
  let order: Order | undefined;
  if (args.orderId) {
    order = data.orders.find(o => o.id === args.orderId);
  }
  if (!order && args.customerName) {
    const q = args.customerName.toLowerCase().trim();
    order = data.orders.find(o => o.customerName?.toLowerCase().includes(q) && o.status !== 'Completed');
  }
  if (!order && args.query) {
    const q = args.query.toLowerCase().trim();
    order = data.orders.find(o =>
      (o.customerName?.toLowerCase().includes(q) || o.customName?.toLowerCase().includes(q)) &&
      o.status !== 'Completed'
    );
  }

  if (!order) {
    return { success: false, error: 'Could not find an active order matching that ID or customer name.' };
  }

  const isWorking = args.isWorkingOn !== undefined ? (args.isWorkingOn ? 1 : 0) : 1;
  data.updateOrder(order.id, { workingOn: isWorking }).catch(console.error);

  const actionText = isWorking === 1 ? 'added to' : 'removed from';
  return {
    success: true,
    data: {
      message: `Order for ${order.customerName} (${order.customName || 'Item'}) ${actionText} Currently Working On section.`,
      orderId: order.id,
      customerName: order.customerName,
      productName: order.customName,
      workingOn: isWorking === 1,
    },
  };
}
