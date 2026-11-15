import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useRef,
} from "react";
import * as SQLite from "expo-sqlite";
import { Platform } from "react-native";
import {
  Order,
  OrderSource,
  OrderStatus,
  PaymentStatus,
  Product,
  Customer,
  Expense,
  ExpenseCategory,
  MonthlyGoal,
  GoalStatus,
  User,
} from "@/types";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  syncSingleOrder,
  SyncResult,
  serialSyncQueue,
  SyncProgressUpdate,
  reconcileOrdersWithOnline,
  ReconcileResult,
} from "@/services/syncService";
import { onTokenRefreshed } from "@/services/apiClient";

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
}

const today = () => new Date().toISOString().split("T")[0];

interface DatabaseContextType {
  orders: Order[];
  products: Product[];
  customers: Customer[];
  expenses: Expense[];
  goals: MonthlyGoal[];
  user: User | null;
  loading: boolean;
  saveUser: (user: User) => Promise<void>;
  clearUser: () => Promise<void>;
  addOrder: (order: Omit<Order, "id" | "createdAt">) => Promise<string>;
  updateOrder: (id: string, updates: Partial<Order>) => Promise<void>;
  deleteOrder: (id: string) => Promise<void>;
  getOrder: (id: string) => Order | undefined;
  toggleWorkingOn: (id: string) => Promise<void>;
  addProduct: (product: Omit<Product, "id">) => Promise<string>;
  updateProduct: (id: string, updates: Partial<Product>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  findProductByName: (name: string) => Product | undefined;
  addCustomer: (
    customer: Omit<Customer, "id" | "createdAt">,
  ) => Promise<string>;
  updateCustomer: (id: string, updates: Partial<Customer>) => Promise<void>;
  findCustomerByIg: (ig: string) => Customer | undefined;
  findCustomerByPhone: (phone: string) => Customer | undefined;
  clearDeliveredImages: () => Promise<number>;
  importBackup: (data: {
    orders: Order[];
    products: Product[];
    customers?: Customer[];
    expenses?: Expense[];
    goals?: MonthlyGoal[];
  }) => Promise<void>;
  addExpense: (expense: Omit<Expense, "id" | "createdAt">) => Promise<string>;
  updateExpense: (id: string, updates: Partial<Expense>) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  addMonthlyGoal: (goal: {
    title?: string;
    month: string;
    targetAmount: number;
    startDate?: string;
    endDate?: string;
  }) => Promise<string>;
  updateMonthlyGoal: (
    id: string,
    updates: Partial<MonthlyGoal>,
  ) => Promise<void>;
  deleteMonthlyGoal: (id: string) => Promise<void>;
  getGoalsByMonth: (month: string) => MonthlyGoal[];
  getMonthlyGoal: (month: string) => MonthlyGoal | undefined;
  setMonthlyGoal: (
    month: string,
    targetAmount: number,
    startDate?: string,
    endDate?: string,
    title?: string,
  ) => Promise<MonthlyGoal>;
  snapshotExpiredGoals: () => Promise<void>;
  syncOrderNow: (id: string) => Promise<SyncResult>;
  syncAllPendingOrders: () => Promise<void>;
  reconcileWithOnlineDb: () => Promise<ReconcileResult>;
  syncProgress: SyncProgressUpdate;
  syncedCount: number;
  totalOrdersCount: number;
  syncPercentage: number;
}

const DatabaseContext = createContext<DatabaseContextType | null>(null);

const IS_WEB = Platform.OS === "web";
const ORDERS_KEY = "@orderflow_orders";
const PRODUCTS_KEY = "@orderflow_products";
const CUSTOMERS_KEY = "@orderflow_customers";
const EXPENSES_KEY = "@orderflow_expenses";
const GOALS_KEY = "@orderflow_monthly_goals";
const USER_KEY = "@orderflow_user";

let db: SQLite.SQLiteDatabase | null = null;

function initDb() {
  if (IS_WEB || db) return;
  db = SQLite.openDatabaseSync("orderflow.db");
  db.execSync(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL DEFAULT 'Manual',
      customerName TEXT NOT NULL DEFAULT '',
      contactInfo TEXT DEFAULT '',
      address TEXT DEFAULT '',
      orderDate TEXT DEFAULT '',
      dueDate TEXT DEFAULT '',
      productId TEXT DEFAULT '',
      customName TEXT DEFAULT '',
      referenceImagePath TEXT DEFAULT '',
      thumbnailPath TEXT DEFAULT '',
      price REAL DEFAULT 0,
      paymentStatus TEXT DEFAULT 'Unpaid',
      amountPaid REAL DEFAULT 0,
      status TEXT DEFAULT 'Confirmed',
      trackingLink TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      createdAt TEXT DEFAULT '',
      isCustom INTEGER DEFAULT 0,
      size TEXT DEFAULT '',
      sizeImagePath TEXT DEFAULT '',
      sizeThumbnailPath TEXT DEFAULT '',
      sizeImagePaths TEXT DEFAULT '[]',
      sizeThumbnailPaths TEXT DEFAULT '[]',
      customerId TEXT DEFAULT '',
      workingOn INTEGER DEFAULT 0,
      items TEXT DEFAULT '[]',
      onlineId TEXT DEFAULT '',
      syncStatus TEXT DEFAULT 'PENDING',
      lastSyncedAt TEXT DEFAULT '',
      syncError TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      localOrderId TEXT NOT NULL,
      action TEXT NOT NULL,
      status TEXT DEFAULT 'PENDING',
      retryCount INTEGER DEFAULT 0,
      lastAttempt TEXT DEFAULT '',
      error TEXT DEFAULT '',
      createdAt TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      imagePath TEXT DEFAULT '',
      thumbnailPath TEXT DEFAULT '',
      defaultPrice REAL DEFAULT 0,
      category TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      igHandle TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      address TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      size TEXT DEFAULT '',
      sizeImagePath TEXT DEFAULT '',
      sizeThumbnailPath TEXT DEFAULT '',
      sizeImagePaths TEXT DEFAULT '[]',
      sizeThumbnailPaths TEXT DEFAULT '[]',
      createdAt TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      amount REAL DEFAULT 0,
      category TEXT DEFAULT 'Other',
      note TEXT DEFAULT '',
      date TEXT DEFAULT '',
      createdAt TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS monthly_goals (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'Monthly Goal',
      month TEXT NOT NULL DEFAULT '',
      targetAmount REAL DEFAULT 0,
      earnedAmount REAL DEFAULT 0,
      startDate TEXT DEFAULT '',
      endDate TEXT DEFAULT '',
      status TEXT DEFAULT 'in_progress',
      createdAt TEXT DEFAULT '',
      updatedAt TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS user (
      id TEXT PRIMARY KEY,
      userName TEXT NOT NULL DEFAULT '',
      emailId TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'user',
      createdAt TEXT DEFAULT '',
      updatedAt TEXT DEFAULT '',
      access_token TEXT DEFAULT '',
      refresh_token TEXT DEFAULT ''
    );
  `);
  // Migration: add missing columns if they don't exist yet across all historical schemas
  try {
    db.execSync(`ALTER TABLE orders ADD COLUMN address TEXT DEFAULT ''`);
  } catch {}
  try {
    db.execSync(`ALTER TABLE orders ADD COLUMN size TEXT DEFAULT ''`);
  } catch {}
  try {
    db.execSync(`ALTER TABLE orders ADD COLUMN sizeImagePath TEXT DEFAULT ''`);
  } catch {}
  try {
    db.execSync(
      `ALTER TABLE orders ADD COLUMN sizeThumbnailPath TEXT DEFAULT ''`,
    );
  } catch {}
  try {
    db.execSync(
      `ALTER TABLE orders ADD COLUMN sizeImagePaths TEXT DEFAULT '[]'`,
    );
  } catch {}
  try {
    db.execSync(
      `ALTER TABLE orders ADD COLUMN sizeThumbnailPaths TEXT DEFAULT '[]'`,
    );
  } catch {}
  try {
    db.execSync(`ALTER TABLE orders ADD COLUMN customerId TEXT DEFAULT ''`);
  } catch {}
  try {
    db.execSync(`ALTER TABLE orders ADD COLUMN workingOn INTEGER DEFAULT 0`);
  } catch {}
  try {
    db.execSync(`ALTER TABLE orders ADD COLUMN items TEXT DEFAULT '[]'`);
  } catch {}
  try {
    db.execSync(`ALTER TABLE orders ADD COLUMN isCustom INTEGER DEFAULT 0`);
  } catch {}

  try {
    db.execSync(
      `ALTER TABLE products ADD COLUMN thumbnailPath TEXT DEFAULT ''`,
    );
  } catch {}
  try {
    db.execSync(`ALTER TABLE products ADD COLUMN category TEXT DEFAULT ''`);
  } catch {}

  try {
    db.execSync(
      `ALTER TABLE monthly_goals ADD COLUMN title TEXT DEFAULT 'Monthly Goal'`,
    );
  } catch {}
  try {
    db.execSync(
      `ALTER TABLE monthly_goals ADD COLUMN earnedAmount REAL DEFAULT 0`,
    );
  } catch {}
  try {
    db.execSync(
      `ALTER TABLE monthly_goals ADD COLUMN startDate TEXT DEFAULT ''`,
    );
  } catch {}
  try {
    db.execSync(`ALTER TABLE monthly_goals ADD COLUMN endDate TEXT DEFAULT ''`);
  } catch {}
  try {
    db.execSync(
      `ALTER TABLE monthly_goals ADD COLUMN status TEXT DEFAULT 'in_progress'`,
    );
  } catch {}
  try {
    db.execSync(
      `ALTER TABLE monthly_goals ADD COLUMN updatedAt TEXT DEFAULT ''`,
    );
  } catch {}

  try {
    db.execSync(`ALTER TABLE customers ADD COLUMN notes TEXT DEFAULT ''`);
  } catch {}
  try {
    db.execSync(`ALTER TABLE customers ADD COLUMN size TEXT DEFAULT ''`);
  } catch {}
  try {
    db.execSync(
      `ALTER TABLE customers ADD COLUMN sizeImagePath TEXT DEFAULT ''`,
    );
  } catch {}
  try {
    db.execSync(
      `ALTER TABLE customers ADD COLUMN sizeThumbnailPath TEXT DEFAULT ''`,
    );
  } catch {}
  try {
    db.execSync(
      `ALTER TABLE customers ADD COLUMN sizeImagePaths TEXT DEFAULT '[]'`,
    );
  } catch {}
  try {
    db.execSync(
      `ALTER TABLE customers ADD COLUMN sizeThumbnailPaths TEXT DEFAULT '[]'`,
    );
  } catch {}
  try {
    db.execSync(`ALTER TABLE customers ADD COLUMN igHandle TEXT DEFAULT ''`);
  } catch {}
  try {
    db.execSync(`ALTER TABLE customers ADD COLUMN phone TEXT DEFAULT ''`);
  } catch {}
  try {
    db.execSync(`ALTER TABLE customers ADD COLUMN email TEXT DEFAULT ''`);
  } catch {}
  try {
    db.execSync(`ALTER TABLE customers ADD COLUMN address TEXT DEFAULT ''`);
  } catch {}

  // Sync columns migration
  try {
    db.execSync(`ALTER TABLE orders ADD COLUMN onlineId TEXT DEFAULT ''`);
  } catch {}
  try {
    db.execSync(
      `ALTER TABLE orders ADD COLUMN syncStatus TEXT DEFAULT 'PENDING'`,
    );
  } catch {}
  try {
    db.execSync(`ALTER TABLE orders ADD COLUMN lastSyncedAt TEXT DEFAULT ''`);
  } catch {}
  try {
    db.execSync(`ALTER TABLE orders ADD COLUMN syncError TEXT DEFAULT ''`);
  } catch {}

  // Backfill: Migrate size and size images from most recent order to customer if customer has none
  // Gated by PRAGMA user_version so it only runs once per device instead of every app launch
  try {
    const userVersion =
      db.getFirstSync<{ user_version: number }>("PRAGMA user_version")
        ?.user_version ?? 0;
    if (userVersion < 1) {
      db.execSync(`
        UPDATE customers 
        SET size = (
          SELECT o.size FROM orders o 
          WHERE (o.customerId = customers.id OR LOWER(TRIM(o.customerName)) = LOWER(TRIM(customers.name))) 
            AND o.size IS NOT NULL AND o.size != ''
          ORDER BY o.createdAt DESC LIMIT 1
        )
        WHERE size IS NULL OR size = '';

        UPDATE customers 
        SET 
          sizeImagePath = (
            SELECT o.sizeImagePath FROM orders o 
            WHERE (o.customerId = customers.id OR LOWER(TRIM(o.customerName)) = LOWER(TRIM(customers.name))) 
              AND o.sizeImagePath IS NOT NULL AND o.sizeImagePath != ''
            ORDER BY o.createdAt DESC LIMIT 1
          ),
          sizeThumbnailPath = (
            SELECT o.sizeThumbnailPath FROM orders o 
            WHERE (o.customerId = customers.id OR LOWER(TRIM(o.customerName)) = LOWER(TRIM(customers.name))) 
              AND o.sizeThumbnailPath IS NOT NULL AND o.sizeThumbnailPath != ''
            ORDER BY o.createdAt DESC LIMIT 1
          ),
          sizeImagePaths = (
            SELECT o.sizeImagePaths FROM orders o 
            WHERE (o.customerId = customers.id OR LOWER(TRIM(o.customerName)) = LOWER(TRIM(customers.name))) 
              AND o.sizeImagePaths IS NOT NULL AND o.sizeImagePaths != '' AND o.sizeImagePaths != '[]'
            ORDER BY o.createdAt DESC LIMIT 1
          ),
          sizeThumbnailPaths = (
            SELECT o.sizeThumbnailPaths FROM orders o 
            WHERE (o.customerId = customers.id OR LOWER(TRIM(o.customerName)) = LOWER(TRIM(customers.name))) 
              AND o.sizeThumbnailPaths IS NOT NULL AND o.sizeThumbnailPaths != '' AND o.sizeThumbnailPaths != '[]'
            ORDER BY o.createdAt DESC LIMIT 1
          )
        WHERE (sizeImagePaths IS NULL OR sizeImagePaths = '' OR sizeImagePaths = '[]')
          AND (sizeImagePath IS NULL OR sizeImagePath = '');

        PRAGMA user_version = 1;
      `);
    }
  } catch (err) {
    console.error("Migration backfill check error:", err);
  }
}

function calculateEarnedForRange(
  ordersList: Order[],
  startDate: string,
  endDate: string,
): number {
  return ordersList
    .filter((o) => {
      const d = (o.orderDate || o.createdAt || "").slice(0, 10);
      return d >= startDate && d <= endDate;
    })
    .reduce((sum, o) => sum + (o.amountPaid || 0), 0);
}

function loadGoalsFromDb(): MonthlyGoal[] {
  if (IS_WEB || !db) return [];
  try {
    return db.getAllSync<MonthlyGoal>(
      "SELECT * FROM monthly_goals ORDER BY month DESC, createdAt DESC",
    );
  } catch {
    return [];
  }
}

function loadOrdersFromDb(): Order[] {
  if (IS_WEB || !db) return [];
  try {
    const rows = db.getAllSync<any>(
      "SELECT * FROM orders ORDER BY createdAt DESC",
    );
    return rows.map((r) => {
      let parsedItems: any[] = [];
      try {
        parsedItems = r.items ? JSON.parse(r.items) : [];
      } catch (err) {
        console.error("Failed to parse items JSON for order:", r.id, err);
      }

      let parsedSizeImagePaths: string[] = [];
      try {
        if (r.sizeImagePaths) {
          parsedSizeImagePaths =
            typeof r.sizeImagePaths === "string" &&
            r.sizeImagePaths.startsWith("[")
              ? JSON.parse(r.sizeImagePaths)
              : Array.isArray(r.sizeImagePaths)
                ? r.sizeImagePaths
                : [];
        } else if (r.sizeImagePath) {
          parsedSizeImagePaths = [r.sizeImagePath];
        }
      } catch {
        parsedSizeImagePaths = r.sizeImagePath ? [r.sizeImagePath] : [];
      }

      let parsedSizeThumbnailPaths: string[] = [];
      try {
        if (r.sizeThumbnailPaths) {
          parsedSizeThumbnailPaths =
            typeof r.sizeThumbnailPaths === "string" &&
            r.sizeThumbnailPaths.startsWith("[")
              ? JSON.parse(r.sizeThumbnailPaths)
              : Array.isArray(r.sizeThumbnailPaths)
                ? r.sizeThumbnailPaths
                : [];
        } else if (r.sizeThumbnailPath) {
          parsedSizeThumbnailPaths = [r.sizeThumbnailPath];
        }
      } catch {
        parsedSizeThumbnailPaths = r.sizeThumbnailPath
          ? [r.sizeThumbnailPath]
          : [];
      }

      // If there are no items but there are legacy product details, synthesize a single legacy item
      if (parsedItems.length === 0 && (r.customName || r.productId)) {
        parsedItems = [
          {
            id: "legacy-" + r.id,
            productId: r.productId || "",
            productName: r.customName || "",
            size: r.size || "",
            price: r.price || 0,
            quantity: 1,
            imagePath: r.referenceImagePath || "",
            thumbnailPath: r.thumbnailPath || "",
            sizeImagePath: r.sizeImagePath || "",
            sizeThumbnailPath: r.sizeThumbnailPath || "",
            sizeImagePaths: parsedSizeImagePaths,
            sizeThumbnailPaths: parsedSizeThumbnailPaths,
            isCustom: r.isCustom === 1,
          },
        ];
      }

      parsedItems = parsedItems.map((item) => ({
        ...item,
        imagePaths: item.imagePaths || (item.imagePath ? [item.imagePath] : []),
        thumbnailPaths:
          item.thumbnailPaths ||
          (item.thumbnailPath ? [item.thumbnailPath] : []),
        sizeImagePaths:
          item.sizeImagePaths ||
          (item.sizeImagePath ? [item.sizeImagePath] : []),
        sizeThumbnailPaths:
          item.sizeThumbnailPaths ||
          (item.sizeThumbnailPath ? [item.sizeThumbnailPath] : []),
      }));

      return {
        ...r,
        isCustom: r.isCustom === 1 ? 1 : 0,
        workingOn: r.workingOn === 1 ? 1 : 0,
        sizeImagePath: r.sizeImagePath || "",
        sizeThumbnailPath: r.sizeThumbnailPath || "",
        sizeImagePaths: parsedSizeImagePaths,
        sizeThumbnailPaths: parsedSizeThumbnailPaths,
        items: parsedItems,
      };
    });
  } catch (err) {
    console.error("Failed to load orders from DB:", err);
    return [];
  }
}

function loadProductsFromDb(): Product[] {
  if (IS_WEB || !db) return [];
  try {
    return db.getAllSync<Product>("SELECT * FROM products ORDER BY name ASC");
  } catch {
    return [];
  }
}

function loadCustomersFromDb(): Customer[] {
  if (IS_WEB || !db) return [];
  try {
    const rows = db.getAllSync<any>(
      "SELECT * FROM customers ORDER BY createdAt DESC",
    );
    return rows.map((r) => {
      let parsedSizeImagePaths: string[] = [];
      try {
        if (r.sizeImagePaths) {
          parsedSizeImagePaths =
            typeof r.sizeImagePaths === "string" &&
            r.sizeImagePaths.startsWith("[")
              ? JSON.parse(r.sizeImagePaths)
              : Array.isArray(r.sizeImagePaths)
                ? r.sizeImagePaths
                : [];
        } else if (r.sizeImagePath) {
          parsedSizeImagePaths = [r.sizeImagePath];
        }
      } catch {
        parsedSizeImagePaths = r.sizeImagePath ? [r.sizeImagePath] : [];
      }

      let parsedSizeThumbnailPaths: string[] = [];
      try {
        if (r.sizeThumbnailPaths) {
          parsedSizeThumbnailPaths =
            typeof r.sizeThumbnailPaths === "string" &&
            r.sizeThumbnailPaths.startsWith("[")
              ? JSON.parse(r.sizeThumbnailPaths)
              : Array.isArray(r.sizeThumbnailPaths)
                ? r.sizeThumbnailPaths
                : [];
        } else if (r.sizeThumbnailPath) {
          parsedSizeThumbnailPaths = [r.sizeThumbnailPath];
        }
      } catch {
        parsedSizeThumbnailPaths = r.sizeThumbnailPath
          ? [r.sizeThumbnailPath]
          : [];
      }

      return {
        ...r,
        size: r.size || "",
        sizeImagePath: r.sizeImagePath || "",
        sizeThumbnailPath: r.sizeThumbnailPath || "",
        sizeImagePaths: parsedSizeImagePaths,
        sizeThumbnailPaths: parsedSizeThumbnailPaths,
      };
    });
  } catch (err) {
    console.error("Failed to load customers from DB:", err);
    return [];
  }
}

function loadExpensesFromDb(): Expense[] {
  if (IS_WEB || !db) return [];
  try {
    return db.getAllSync<Expense>(
      "SELECT * FROM expenses ORDER BY date DESC, createdAt DESC",
    );
  } catch {
    return [];
  }
}

function loadUserFromDb(): User | null {
  if (IS_WEB || !db) return null;
  try {
    const row = db.getFirstSync<User>("SELECT * FROM user LIMIT 1");
    return row || null;
  } catch {
    return null;
  }
}

export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [goals, setGoals] = useState<MonthlyGoal[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncProgress, setSyncProgress] = useState<SyncProgressUpdate>({
    isSyncing: false,
    totalBatch: 0,
    completedBatch: 0,
  });

  const ordersRef = useRef<Order[]>(orders);
  ordersRef.current = orders;
  const customersRef = useRef<Customer[]>(customers);
  customersRef.current = customers;
  const userRef = useRef<User | null>(user);
  userRef.current = user;

  const isSyncAllowed = useCallback(() => {
    const u = userRef.current;
    return Boolean(u && u.access_token && u.refresh_token);
  }, []);

  const checkAndReconcileRef = useRef<() => Promise<ReconcileResult>>(() =>
    Promise.resolve({ totalChecked: 0, missingCount: 0, missingOrderIds: [] }),
  );

  useEffect(() => {
    serialSyncQueue.setProgressListener(setSyncProgress);
    serialSyncQueue.setOnQueueFinishedListener(() => {
      // After sync queue completes, check online DB to verify all orders are present;
      // if any were deleted by DB user, reset to pending and auto-send again!
      checkAndReconcileRef.current();
    });
  }, []);

  useEffect(() => {
    const unsubscribe = onTokenRefreshed((newAccessToken, newRefreshToken) => {
      setUser((prev) => {
        if (!prev) return null;
        const updated = {
          ...prev,
          access_token: newAccessToken,
          refresh_token: newRefreshToken || prev.refresh_token,
          updatedAt: new Date().toISOString(),
        };
        userRef.current = updated;
        return updated;
      });
    });
    return unsubscribe;
  }, []);

  const syncedCount = orders.filter((o) => o.syncStatus === "SYNCED").length;
  const totalOrdersCount = orders.length;
  const syncPercentage =
    totalOrdersCount > 0
      ? Math.round((syncedCount / totalOrdersCount) * 100)
      : 100;

  useEffect(() => {
    async function init() {
      try {
        if (IS_WEB) {
          const [os, ps, cs, es, gs, us] = await Promise.all([
            AsyncStorage.getItem(ORDERS_KEY),
            AsyncStorage.getItem(PRODUCTS_KEY),
            AsyncStorage.getItem(CUSTOMERS_KEY),
            AsyncStorage.getItem(EXPENSES_KEY),
            AsyncStorage.getItem(GOALS_KEY),
            AsyncStorage.getItem(USER_KEY),
          ]);
          const parsedOrders = os ? JSON.parse(os) : [];
          const sanitizedOrders = parsedOrders.map((o: any) => {
            let parsedItems = o.items || [];
            if (parsedItems.length === 0 && (o.customName || o.productId)) {
              parsedItems = [
                {
                  id: "legacy-" + o.id,
                  productId: o.productId || "",
                  productName: o.customName || "",
                  size: o.size || "",
                  price: o.price || 0,
                  quantity: 1,
                  imagePath: o.referenceImagePath || "",
                  thumbnailPath: o.thumbnailPath || "",
                  isCustom: !!o.isCustom,
                },
              ];
            }
            parsedItems = parsedItems.map((item: any) => ({
              ...item,
              imagePaths:
                item.imagePaths || (item.imagePath ? [item.imagePath] : []),
              thumbnailPaths:
                item.thumbnailPaths ||
                (item.thumbnailPath ? [item.thumbnailPath] : []),
              sizeImagePaths:
                item.sizeImagePaths ||
                (item.sizeImagePath ? [item.sizeImagePath] : []),
              sizeThumbnailPaths:
                item.sizeThumbnailPaths ||
                (item.sizeThumbnailPath ? [item.sizeThumbnailPath] : []),
            }));
            return {
              ...o,
              items: parsedItems,
            };
          });
          setOrders(sanitizedOrders);
          setProducts(ps ? JSON.parse(ps) : []);
          setExpenses(es ? JSON.parse(es) : []);
          setGoals(gs ? JSON.parse(gs) : []);
          setUser(us ? JSON.parse(us) : null);
          const parsedCustomers = cs ? JSON.parse(cs) : [];
          let customerUpdated = false;
          const sanitizedCustomers = parsedCustomers.map((c: any) => {
            let updated = { ...c };
            if (updated.igHandle && updated.igHandle.includes("@")) {
              customerUpdated = true;
              updated.igHandle = updated.igHandle.replace(/@/g, "").trim();
            }
            if (!updated.size) {
              const prevOrder = sanitizedOrders.find(
                (o: any) =>
                  (o.customerId === c.id ||
                    (o.customerName &&
                      c.name &&
                      o.customerName.toLowerCase() === c.name.toLowerCase())) &&
                  (o.size || (o.items && o.items[0]?.size)),
              );
              if (prevOrder) {
                customerUpdated = true;
                updated.size =
                  prevOrder.size ||
                  (prevOrder.items && prevOrder.items[0]?.size) ||
                  "";
                if (
                  !updated.sizeImagePaths ||
                  updated.sizeImagePaths.length === 0
                ) {
                  updated.sizeImagePath = prevOrder.sizeImagePath || "";
                  updated.sizeThumbnailPath = prevOrder.sizeThumbnailPath || "";
                  updated.sizeImagePaths = prevOrder.sizeImagePaths || [];
                  updated.sizeThumbnailPaths =
                    prevOrder.sizeThumbnailPaths || [];
                }
              }
            }
            return updated;
          });
          if (customerUpdated) {
            persistCustomers(sanitizedCustomers);
          } else {
            setCustomers(sanitizedCustomers);
          }
        } else {
          initDb();
          let loadedOrders = loadOrdersFromDb();
          let loadedCustomers = loadCustomersFromDb();

          let customerUpdated = false;
          loadedCustomers = loadedCustomers.map((c) => {
            let updated = { ...c };
            if (updated.igHandle && updated.igHandle.includes("@")) {
              customerUpdated = true;
              const cleaned = updated.igHandle.replace(/@/g, "").trim();
              if (!IS_WEB && db) {
                db.runSync("UPDATE customers SET igHandle=? WHERE id=?", [
                  cleaned,
                  c.id,
                ]);
              }
              updated.igHandle = cleaned;
            }
            return updated;
          });
          if (customerUpdated) {
            persistCustomers(loadedCustomers);
          }

          if (loadedCustomers.length === 0 && loadedOrders.length > 0 && db) {
            const map: Record<string, any> = {};
            for (const o of loadedOrders) {
              const key = o.customerName?.trim() || "Unknown";
              if (!map[key]) {
                const igMatch = o.contactInfo?.match(/@[\w.]+/);
                const pMatch = o.contactInfo?.match(/\+?[0-9\s-]{10,}/);
                const eMatch = o.contactInfo?.match(/[\w.-]+@[\w.-]+\.\w+/);
                map[key] = {
                  id: genId(),
                  name: key,
                  igHandle: igMatch ? igMatch[0].replace("@", "") : "",
                  phone: pMatch ? pMatch[0].replace(/[^0-9+]/g, "") : "",
                  email: eMatch ? eMatch[0] : "",
                  address: o.address || "",
                  size: o.size || (o.items && o.items[0]?.size) || "",
                  sizeImagePath: o.sizeImagePath || "",
                  sizeThumbnailPath: o.sizeThumbnailPath || "",
                  sizeImagePaths: o.sizeImagePaths || [],
                  sizeThumbnailPaths: o.sizeThumbnailPaths || [],
                  createdAt: o.createdAt || new Date().toISOString(),
                };
              }
              o.customerId = map[key].id;
              db.runSync("UPDATE orders SET customerId=? WHERE id=?", [
                o.customerId || null,
                o.id,
              ]);
            }
            const newCustomers = Object.values(map);
            for (const c of newCustomers as any[]) {
              db.runSync(
                "INSERT INTO customers (id,name,igHandle,phone,email,address,notes,size,sizeImagePath,sizeThumbnailPath,sizeImagePaths,sizeThumbnailPaths,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                [
                  c.id,
                  c.name,
                  c.igHandle,
                  c.phone,
                  c.email,
                  c.address,
                  c.notes || "",
                  c.size || "",
                  c.sizeImagePath || "",
                  c.sizeThumbnailPath || "",
                  JSON.stringify(c.sizeImagePaths || []),
                  JSON.stringify(c.sizeThumbnailPaths || []),
                  c.createdAt,
                ],
              );
            }
            loadedCustomers = newCustomers;
          }
          setOrders(loadedOrders);
          setProducts(loadProductsFromDb());
          setCustomers(loadedCustomers);
          setExpenses(loadExpensesFromDb());
          setGoals(loadGoalsFromDb());
          setUser(loadUserFromDb());
        }
      } catch (err) {
        console.error("Database initialization failed:", err);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  async function persistOrders(next: Order[]) {
    setOrders(next);
    if (IS_WEB) await AsyncStorage.setItem(ORDERS_KEY, JSON.stringify(next));
  }

  async function persistProducts(next: Product[]) {
    setProducts(next);
    if (IS_WEB) await AsyncStorage.setItem(PRODUCTS_KEY, JSON.stringify(next));
  }

  async function persistCustomers(next: Customer[]) {
    setCustomers(next);
    if (IS_WEB) await AsyncStorage.setItem(CUSTOMERS_KEY, JSON.stringify(next));
  }

  async function persistExpenses(next: Expense[]) {
    setExpenses(next);
    if (IS_WEB) await AsyncStorage.setItem(EXPENSES_KEY, JSON.stringify(next));
  }

  async function persistGoals(next: MonthlyGoal[]) {
    setGoals(next);
    if (IS_WEB) await AsyncStorage.setItem(GOALS_KEY, JSON.stringify(next));
  }

  const ORDER_DB_COLUMNS = new Set([
    "source",
    "customerName",
    "contactInfo",
    "address",
    "orderDate",
    "dueDate",
    "productId",
    "customName",
    "referenceImagePath",
    "thumbnailPath",
    "price",
    "paymentStatus",
    "amountPaid",
    "status",
    "trackingLink",
    "notes",
    "isCustom",
    "size",
    "sizeImagePath",
    "sizeThumbnailPath",
    "sizeImagePaths",
    "sizeThumbnailPaths",
    "customerId",
    "workingOn",
    "items",
    "onlineId",
    "syncStatus",
    "lastSyncedAt",
    "syncError",
  ]);

  const SYNC_METADATA_KEYS = new Set([
    "onlineId",
    "syncStatus",
    "lastSyncedAt",
    "syncError",
  ]);

  const triggerBackgroundSyncRef = React.useRef<(id?: string) => void>(
    () => {},
  );

  const addOrder = useCallback(
    async (order: Omit<Order, "id" | "createdAt">): Promise<string> => {
      const id = genId();
      const createdAt = new Date().toISOString();
      const full: Order = {
        ...order,
        id,
        createdAt,
        onlineId: order.onlineId || "",
        syncStatus: order.syncStatus || "PENDING",
        lastSyncedAt: order.lastSyncedAt || "",
        syncError: order.syncError || "",
      } as Order;

      if (!IS_WEB && db) {
        db.runSync(
          `INSERT INTO orders (id,source,customerName,contactInfo,address,orderDate,dueDate,productId,customName,referenceImagePath,thumbnailPath,price,paymentStatus,amountPaid,status,trackingLink,notes,createdAt,isCustom,size,sizeImagePath,sizeThumbnailPath,sizeImagePaths,sizeThumbnailPaths,customerId,workingOn,items,onlineId,syncStatus,lastSyncedAt,syncError)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            id,
            full.source,
            full.customerName,
            full.contactInfo,
            full.address ?? "",
            full.orderDate,
            full.dueDate,
            full.productId,
            full.customName,
            full.referenceImagePath,
            full.thumbnailPath,
            full.price,
            full.paymentStatus,
            full.amountPaid,
            full.status,
            full.trackingLink,
            full.notes,
            createdAt,
            full.isCustom ? 1 : 0,
            full.size ?? "",
            full.sizeImagePath ?? "",
            full.sizeThumbnailPath ?? "",
            JSON.stringify(
              full.sizeImagePaths ||
                (full.sizeImagePath ? [full.sizeImagePath] : []),
            ),
            JSON.stringify(
              full.sizeThumbnailPaths ||
                (full.sizeThumbnailPath ? [full.sizeThumbnailPath] : []),
            ),
            full.customerId ?? "",
            full.workingOn ? 1 : 0,
            JSON.stringify(full.items || []),
            full.onlineId ?? "",
            full.syncStatus ?? "PENDING",
            full.lastSyncedAt ?? "",
            full.syncError ?? "",
          ],
        );
        const loaded = loadOrdersFromDb();
        setOrders(loaded);
      } else {
        setOrders((prev) => {
          const next = [full, ...prev];
          AsyncStorage.setItem(ORDERS_KEY, JSON.stringify(next));
          return next;
        });
      }
      triggerBackgroundSyncRef.current(id);
      return id;
    },
    [],
  );

  const updateOrder = useCallback(
    async (id: string, updates: Partial<Order>) => {
      const isClosing =
        updates.status === "Completed" ||
        updates.status === "Shipped" ||
        updates.status === "Delivered";

      if (!IS_WEB && db) {
        const u: any = { ...updates };
        if (isClosing && updates.workingOn === undefined) {
          u.workingOn = 0;
        }
        if (u.items !== undefined) {
          u.items = JSON.stringify(u.items);
        }
        if (u.sizeImagePaths !== undefined) {
          u.sizeImagePaths = Array.isArray(u.sizeImagePaths)
            ? JSON.stringify(u.sizeImagePaths)
            : u.sizeImagePaths;
        }
        if (u.sizeThumbnailPaths !== undefined) {
          u.sizeThumbnailPaths = Array.isArray(u.sizeThumbnailPaths)
            ? JSON.stringify(u.sizeThumbnailPaths)
            : u.sizeThumbnailPaths;
        }
        if (u.isCustom !== undefined) {
          u.isCustom = u.isCustom ? 1 : 0;
        }
        if (u.workingOn !== undefined) {
          u.workingOn = u.workingOn ? 1 : 0;
        }

        const fields = Object.keys(u).filter((k) => ORDER_DB_COLUMNS.has(k));
        if (fields.length > 0) {
          const set = fields.map((f) => `${f}=?`).join(",");
          const vals = fields.map((f) => u[f] ?? "");
          db.runSync(`UPDATE orders SET ${set} WHERE id=?`, [...vals, id]);
        }
        const loaded = loadOrdersFromDb();
        setOrders(loaded);
      } else {
        setOrders((prev) => {
          const next = prev.map((o) => {
            if (o.id !== id) return o;
            const merged = { ...o, ...updates };
            if (isClosing && updates.workingOn === undefined) {
              merged.workingOn = 0;
            }
            return merged;
          });
          AsyncStorage.setItem(ORDERS_KEY, JSON.stringify(next));
          return next;
        });
      }

      const hasBusinessChanges = Object.keys(updates).some(
        (k) => !SYNC_METADATA_KEYS.has(k),
      );
      if (hasBusinessChanges) {
        triggerBackgroundSyncRef.current(id);
      }
    },
    [],
  );

  const syncOrderNow = useCallback(
    async (id: string): Promise<SyncResult> => {
      // Sync is strictly disabled when user is null or missing tokens
      if (!isSyncAllowed()) {
        return {
          success: false,
          error:
            "Sync disabled: User must be signed in with both access and refresh tokens",
        };
      }

      let target: Order | undefined;
      if (!IS_WEB && db) {
        const all = loadOrdersFromDb();
        target = all.find((o) => o.id === id);
      } else {
        target = ordersRef.current.find((o) => o.id === id);
      }

      if (!target) {
        return { success: false, error: `Order ${id} not found` };
      }

      // If already synced, skip network request entirely
      if (target.syncStatus === "SYNCED") {
        return { success: true, onlineId: target.onlineId };
      }

      const linkedCustomer = customersRef.current.find(
        (c) =>
          c.id === target?.customerId ||
          (target?.customerName &&
            c.name.toLowerCase() === target.customerName.toLowerCase()),
      );

      return await syncSingleOrder(target, linkedCustomer, updateOrder);
    },
    [updateOrder],
  );

  const getOrderName = useCallback((orderId: string) => {
    const ord = ordersRef.current.find((o) => o.id === orderId);
    return ord?.customerName;
  }, []);

  const triggerBackgroundSync = useCallback(
    (id?: string) => {
      // Sync is strictly disabled when user is null or missing tokens
      if (!isSyncAllowed()) {
        return;
      }

      let pendingIds: string[] = [];
      if (!IS_WEB && db) {
        try {
          const rows = db.getAllSync<{ id: string }>(
            "SELECT id FROM orders WHERE syncStatus = 'PENDING' OR (syncStatus != 'SYNCED' AND syncStatus != 'SYNCING') ORDER BY createdAt ASC",
          );
          pendingIds = rows.map((r) => r.id);
        } catch {
          pendingIds = ordersRef.current
            .filter(
              (o) =>
                o.syncStatus === "PENDING" ||
                (!o.onlineId && o.syncStatus !== "SYNCED"),
            )
            .map((o) => o.id);
        }
      } else {
        pendingIds = ordersRef.current
          .filter(
            (o) =>
              o.syncStatus === "PENDING" ||
              (!o.onlineId && o.syncStatus !== "SYNCED"),
          )
          .map((o) => o.id);
      }

      // If a specific order is triggered, put it first, then append any previous pending orders
      const orderList = id
        ? Array.from(new Set([id, ...pendingIds]))
        : pendingIds;

      if (orderList.length > 0) {
        serialSyncQueue.enqueue(
          orderList,
          (orderId) => syncOrderNow(orderId),
          getOrderName,
        );
      }
    },
    [syncOrderNow, getOrderName],
  );

  triggerBackgroundSyncRef.current = triggerBackgroundSync;

  const syncAllPendingOrders = useCallback(async () => {
    // Sync is strictly disabled when user is null or missing tokens
    if (!isSyncAllowed()) {
      return;
    }

    let pendingIds: string[] = [];
    if (!IS_WEB && db) {
      try {
        const rows = db.getAllSync<{ id: string }>(
          "SELECT id FROM orders WHERE syncStatus = 'PENDING' OR (syncStatus != 'SYNCED' AND syncStatus != 'SYNCING') ORDER BY createdAt ASC",
        );
        pendingIds = rows.map((r) => r.id);
      } catch {
        pendingIds = ordersRef.current
          .filter(
            (o) =>
              o.syncStatus === "PENDING" ||
              (!o.onlineId && o.syncStatus !== "SYNCED"),
          )
          .map((o) => o.id);
      }
    } else {
      pendingIds = ordersRef.current
        .filter(
          (o) =>
            o.syncStatus === "PENDING" ||
            (!o.onlineId && o.syncStatus !== "SYNCED"),
        )
        .map((o) => o.id);
    }

    if (pendingIds.length > 0) {
      serialSyncQueue.enqueue(
        pendingIds,
        (orderId) => syncOrderNow(orderId),
        getOrderName,
      );
    }
  }, [syncOrderNow, getOrderName]);

  const isReconcilingRef = useRef<boolean>(false);

  const checkAndReconcileWithOnlineDb =
    useCallback(async (): Promise<ReconcileResult> => {
      if (isReconcilingRef.current) {
        return { totalChecked: 0, missingCount: 0, missingOrderIds: [] };
      }
      if (!isSyncAllowed()) {
        return { totalChecked: 0, missingCount: 0, missingOrderIds: [] };
      }

      isReconcilingRef.current = true;
      try {
        const allOrders =
          !IS_WEB && db ? loadOrdersFromDb() : ordersRef.current;
        const result = await reconcileOrdersWithOnline(allOrders, updateOrder);

        if (result.missingCount > 0) {
          console.log(
            `[syncReconcile] Detected ${result.missingCount} order(s) missing from remote DB. Re-sending them online now...`,
          );
          // Automatically trigger sync so the missing orders are created online again!
          triggerBackgroundSyncRef.current();
        }
        return result;
      } catch (err) {
        console.warn("[syncReconcile] Error checking online orders:", err);
        return { totalChecked: 0, missingCount: 0, missingOrderIds: [] };
      } finally {
        isReconcilingRef.current = false;
      }
    }, [isSyncAllowed, updateOrder]);

  checkAndReconcileRef.current = checkAndReconcileWithOnlineDb;

  const deleteOrder = useCallback(async (id: string) => {
    if (!IS_WEB && db) {
      db.runSync("DELETE FROM orders WHERE id=?", [id]);
      const loaded = loadOrdersFromDb();
      setOrders(loaded);
    } else {
      setOrders((prev) => {
        const next = prev.filter((o) => o.id !== id);
        AsyncStorage.setItem(ORDERS_KEY, JSON.stringify(next));
        return next;
      });
    }
  }, []);

  const getOrder = useCallback(
    (id: string) => orders.find((o) => o.id === id),
    [orders],
  );

  const toggleWorkingOn = useCallback(
    async (id: string) => {
      const order = orders.find((o) => o.id === id);
      if (!order) return;
      const isClosed =
        order.status === "Completed" ||
        order.status === "Shipped" ||
        order.status === "Delivered";
      // Prevent toggling WIP on if the order is already closed
      if (isClosed && !order.workingOn) return;
      const next = order.workingOn ? 0 : 1;
      await updateOrder(id, { workingOn: next });
    },
    [orders, updateOrder],
  );

  const addProduct = useCallback(
    async (product: Omit<Product, "id">): Promise<string> => {
      const id = genId();
      const full: Product = { ...product, id } as Product;
      if (!IS_WEB && db) {
        db.runSync(
          "INSERT INTO products (id,name,imagePath,thumbnailPath,defaultPrice,category) VALUES (?,?,?,?,?,?)",
          [
            id,
            full.name,
            full.imagePath,
            full.thumbnailPath,
            full.defaultPrice,
            full.category,
          ],
        );
      }
      await persistProducts(
        [...products, full].sort((a, b) => a.name.localeCompare(b.name)),
      );
      return id;
    },
    [products],
  );

  const updateProduct = useCallback(
    async (id: string, updates: Partial<Product>) => {
      const next = products.map((p) =>
        p.id === id ? { ...p, ...updates } : p,
      );
      if (!IS_WEB && db) {
        const fields = Object.keys(updates).filter((k) => k !== "id");
        if (fields.length > 0) {
          const set = fields.map((f) => `${f}=?`).join(",");
          const vals = fields.map((f) => (updates as any)[f]);
          db.runSync(`UPDATE products SET ${set} WHERE id=?`, [...vals, id]);
        }
      }
      await persistProducts(next);
    },
    [products],
  );

  const deleteProduct = useCallback(
    async (id: string) => {
      const next = products.filter((p) => p.id !== id);
      if (!IS_WEB && db) db.runSync("DELETE FROM products WHERE id=?", [id]);
      await persistProducts(next);
    },
    [products],
  );

  const addCustomer = useCallback(
    async (customer: Omit<Customer, "id" | "createdAt">): Promise<string> => {
      const id = genId();
      const createdAt = new Date().toISOString();
      const cleanIg = customer.igHandle
        ? customer.igHandle.replace(/@/g, "").trim()
        : "";
      const full: Customer = {
        ...customer,
        igHandle: cleanIg,
        notes: customer.notes || "",
        size: customer.size || "",
        sizeImagePath: customer.sizeImagePath || "",
        sizeThumbnailPath: customer.sizeThumbnailPath || "",
        sizeImagePaths:
          customer.sizeImagePaths ||
          (customer.sizeImagePath ? [customer.sizeImagePath] : []),
        sizeThumbnailPaths:
          customer.sizeThumbnailPaths ||
          (customer.sizeThumbnailPath ? [customer.sizeThumbnailPath] : []),
        id,
        createdAt,
      } as Customer;
      if (!IS_WEB && db) {
        db.runSync(
          "INSERT INTO customers (id,name,igHandle,phone,email,address,notes,size,sizeImagePath,sizeThumbnailPath,sizeImagePaths,sizeThumbnailPaths,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
          [
            id,
            full.name,
            full.igHandle,
            full.phone,
            full.email,
            full.address,
            full.notes || "",
            full.size || "",
            full.sizeImagePath || "",
            full.sizeThumbnailPath || "",
            JSON.stringify(full.sizeImagePaths || []),
            JSON.stringify(full.sizeThumbnailPaths || []),
            createdAt,
          ],
        );
      }
      await persistCustomers(
        [...customers, full].sort((a, b) => a.name.localeCompare(b.name)),
      );
      return id;
    },
    [customers],
  );

  const updateCustomer = useCallback(
    async (id: string, updates: Partial<Customer>) => {
      const cleanUpdates = { ...updates };
      if (cleanUpdates.igHandle !== undefined) {
        cleanUpdates.igHandle = cleanUpdates.igHandle
          ? cleanUpdates.igHandle.replace(/@/g, "").trim()
          : "";
      }
      const next = customers.map((c) =>
        c.id === id ? { ...c, ...cleanUpdates } : c,
      );
      if (!IS_WEB && db) {
        const u: any = { ...cleanUpdates };
        if (u.sizeImagePaths !== undefined) {
          u.sizeImagePaths = Array.isArray(u.sizeImagePaths)
            ? JSON.stringify(u.sizeImagePaths)
            : u.sizeImagePaths;
        }
        if (u.sizeThumbnailPaths !== undefined) {
          u.sizeThumbnailPaths = Array.isArray(u.sizeThumbnailPaths)
            ? JSON.stringify(u.sizeThumbnailPaths)
            : u.sizeThumbnailPaths;
        }
        const fields = Object.keys(u).filter(
          (k) => k !== "id" && k !== "createdAt",
        );
        if (fields.length > 0) {
          const set = fields.map((f) => `${f}=?`).join(",");
          const vals = fields.map((f) => u[f]);
          db.runSync(`UPDATE customers SET ${set} WHERE id=?`, [...vals, id]);
        }
      }
      await persistCustomers(next);
    },
    [customers],
  );

  const findCustomerByIg = useCallback(
    (ig: string) => {
      if (!ig) return undefined;
      const search = ig.replace("@", "").toLowerCase().trim();
      return customers.find((c) => c.igHandle?.toLowerCase() === search);
    },
    [customers],
  );

  const findCustomerByPhone = useCallback(
    (phone: string) => {
      if (!phone) return undefined;
      const search = phone.replace(/[^0-9+]/g, "");
      return customers.find(
        (c) =>
          (c.phone && search.includes(c.phone.replace(/[^0-9]/g, ""))) ||
          c.phone
            ?.replace(/[^0-9]/g, "")
            .includes(search.replace(/[^0-9]/g, "")),
      );
    },
    [customers],
  );

  const findProductByName = useCallback(
    (name: string) => {
      const lower = name.toLowerCase();
      return products.find((p) => p.name.toLowerCase().includes(lower));
    },
    [products],
  );

  const addExpense = useCallback(
    async (expense: Omit<Expense, "id" | "createdAt">): Promise<string> => {
      const id = genId();
      const createdAt = new Date().toISOString();
      const full: Expense = { ...expense, id, createdAt };
      if (!IS_WEB && db) {
        db.runSync(
          "INSERT INTO expenses (id,amount,category,note,date,createdAt) VALUES (?,?,?,?,?,?)",
          [id, full.amount, full.category, full.note, full.date, createdAt],
        );
        setExpenses(loadExpensesFromDb());
      } else {
        await persistExpenses(
          [full, ...expenses].sort((a, b) => b.date.localeCompare(a.date)),
        );
      }
      return id;
    },
    [expenses],
  );

  const updateExpense = useCallback(
    async (id: string, updates: Partial<Expense>) => {
      if (!IS_WEB && db) {
        const fields = Object.keys(updates).filter(
          (k) => k !== "id" && k !== "createdAt",
        );
        if (fields.length > 0) {
          const set = fields.map((f) => `${f}=?`).join(",");
          const vals = fields.map((f) => (updates as any)[f]);
          db.runSync(`UPDATE expenses SET ${set} WHERE id=?`, [...vals, id]);
        }
        setExpenses(loadExpensesFromDb());
      } else {
        await persistExpenses(
          expenses.map((e) => (e.id === id ? { ...e, ...updates } : e)),
        );
      }
    },
    [expenses],
  );

  const deleteExpense = useCallback(
    async (id: string) => {
      if (!IS_WEB && db) {
        db.runSync("DELETE FROM expenses WHERE id=?", [id]);
        setExpenses(loadExpensesFromDb());
      } else {
        await persistExpenses(expenses.filter((e) => e.id !== id));
      }
    },
    [expenses],
  );

  const clearDeliveredImages = useCallback(async (): Promise<number> => {
    const delivered = orders.filter(
      (o) =>
        o.status === "Delivered" &&
        (o.referenceImagePath ||
          o.thumbnailPath ||
          o.sizeImagePath ||
          o.sizeThumbnailPath ||
          (o.sizeImagePaths && o.sizeImagePaths.length > 0) ||
          (o.items &&
            o.items.some(
              (i) =>
                i.imagePath ||
                i.thumbnailPath ||
                i.sizeImagePath ||
                (i.sizeImagePaths && i.sizeImagePaths.length > 0),
            ))),
    );
    let count = 0;
    for (const o of delivered) {
      const updatedItems = (o.items || []).map((item) => ({
        ...item,
        imagePath: "",
        thumbnailPath: "",
        imagePaths: [],
        thumbnailPaths: [],
        sizeImagePath: "",
        sizeThumbnailPath: "",
        sizeImagePaths: [],
        sizeThumbnailPaths: [],
      }));
      await updateOrder(o.id, {
        referenceImagePath: "",
        thumbnailPath: "",
        sizeImagePath: "",
        sizeThumbnailPath: "",
        sizeImagePaths: [],
        sizeThumbnailPaths: [],
        items: updatedItems,
      });
      count++;
    }
    return count;
  }, [orders, updateOrder]);

  const importBackup = useCallback(
    async (data: {
      orders: Order[];
      products: Product[];
      customers?: Customer[];
      expenses?: Expense[];
      goals?: MonthlyGoal[];
    }) => {
      if (!IS_WEB && db) {
        db.execSync("DELETE FROM orders; DELETE FROM products;");
        for (const o of data.orders) {
          db.runSync(
            `INSERT OR REPLACE INTO orders (id,source,customerName,contactInfo,address,orderDate,dueDate,productId,customName,referenceImagePath,thumbnailPath,price,paymentStatus,amountPaid,status,trackingLink,notes,createdAt,isCustom,size,sizeImagePath,sizeThumbnailPath,sizeImagePaths,sizeThumbnailPaths,customerId,workingOn,items,onlineId,syncStatus,lastSyncedAt,syncError) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              o.id,
              o.source,
              o.customerName,
              o.contactInfo,
              o.address ?? "",
              o.orderDate,
              o.dueDate,
              o.productId,
              o.customName,
              o.referenceImagePath,
              o.thumbnailPath,
              o.price,
              o.paymentStatus,
              o.amountPaid,
              o.status,
              o.trackingLink,
              o.notes,
              o.createdAt,
              o.isCustom ? 1 : 0,
              o.size ?? "",
              o.sizeImagePath ?? "",
              o.sizeThumbnailPath ?? "",
              JSON.stringify(
                o.sizeImagePaths || (o.sizeImagePath ? [o.sizeImagePath] : []),
              ),
              JSON.stringify(
                o.sizeThumbnailPaths ||
                  (o.sizeThumbnailPath ? [o.sizeThumbnailPath] : []),
              ),
              o.customerId ?? "",
              o.workingOn ? 1 : 0,
              JSON.stringify(o.items || []),
              o.onlineId ?? "",
              o.syncStatus ?? (o.onlineId ? "SYNCED" : "PENDING"),
              o.lastSyncedAt ?? "",
              o.syncError ?? "",
            ],
          );
        }
        for (const p of data.products) {
          db.runSync(
            "INSERT OR REPLACE INTO products (id,name,imagePath,thumbnailPath,defaultPrice,category) VALUES (?,?,?,?,?,?)",
            [
              p.id,
              p.name,
              p.imagePath,
              p.thumbnailPath,
              p.defaultPrice,
              p.category,
            ],
          );
        }
        if (data.customers) {
          db.execSync("DELETE FROM customers;");
          for (const c of data.customers) {
            db.runSync(
              "INSERT OR REPLACE INTO customers (id,name,igHandle,phone,email,address,notes,size,sizeImagePath,sizeThumbnailPath,sizeImagePaths,sizeThumbnailPaths,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
              [
                c.id,
                c.name,
                c.igHandle ?? "",
                c.phone ?? "",
                c.email ?? "",
                c.address ?? "",
                c.notes ?? "",
                c.size ?? "",
                c.sizeImagePath ?? "",
                c.sizeThumbnailPath ?? "",
                JSON.stringify(
                  c.sizeImagePaths ||
                    (c.sizeImagePath ? [c.sizeImagePath] : []),
                ),
                JSON.stringify(
                  c.sizeThumbnailPaths ||
                    (c.sizeThumbnailPath ? [c.sizeThumbnailPath] : []),
                ),
                c.createdAt ?? "",
              ],
            );
          }
        }
        if (data.expenses) {
          db.execSync("DELETE FROM expenses;");
          for (const e of data.expenses) {
            db.runSync(
              "INSERT OR REPLACE INTO expenses (id,amount,category,note,date,createdAt) VALUES (?,?,?,?,?,?)",
              [e.id, e.amount, e.category, e.note ?? "", e.date, e.createdAt],
            );
          }
        }
        if (data.goals) {
          db.execSync("DELETE FROM monthly_goals;");
          for (const g of data.goals) {
            db.runSync(
              "INSERT OR REPLACE INTO monthly_goals (id,title,month,targetAmount,earnedAmount,startDate,endDate,status,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?)",
              [
                g.id,
                g.title || "Monthly Goal",
                g.month,
                g.targetAmount,
                g.earnedAmount,
                g.startDate,
                g.endDate,
                g.status,
                g.createdAt,
                g.updatedAt,
              ],
            );
          }
        }
      }
      await persistOrders(data.orders);
      await persistProducts(data.products);
      if (data.customers) {
        await persistCustomers(data.customers);
      }
      if (data.expenses) {
        await persistExpenses(data.expenses);
      }
      if (data.goals) {
        await persistGoals(data.goals);
      }
    },
    [],
  );

  const snapshotExpiredGoals = useCallback(async () => {
    const todayStr = today();
    let changed = false;

    const updatedGoals = goals.map((g) => {
      const currentEarned = calculateEarnedForRange(
        orders,
        g.startDate,
        g.endDate,
      );
      const isPastEndDate = Boolean(g.endDate && todayStr > g.endDate);
      let newStatus: GoalStatus = g.status;

      if (currentEarned >= g.targetAmount) {
        // Target reached or exceeded -> immediately mark as achieved!
        newStatus = "achieved";
      } else if (isPastEndDate) {
        // Past end date and target not reached -> missed
        newStatus = "missed";
      } else {
        // Within active window and still working towards target -> in progress
        newStatus = "in_progress";
      }

      if (newStatus !== g.status || currentEarned !== g.earnedAmount) {
        changed = true;
        const now = new Date().toISOString();
        if (!IS_WEB && db) {
          db.runSync(
            "UPDATE monthly_goals SET earnedAmount=?, status=?, updatedAt=? WHERE id=?",
            [currentEarned, newStatus, now, g.id],
          );
        }
        return {
          ...g,
          earnedAmount: currentEarned,
          status: newStatus,
          updatedAt: now,
        };
      }
      return g;
    });

    if (changed) {
      await persistGoals(updatedGoals);
    }
  }, [goals, orders]);

  // Run goal status synchronization whenever orders or goals load/change
  useEffect(() => {
    if (!loading && goals.length > 0) {
      snapshotExpiredGoals();
    }
  }, [loading, orders, snapshotExpiredGoals]);

  const addMonthlyGoal = useCallback(
    async (goal: {
      title?: string;
      month: string;
      targetAmount: number;
      startDate?: string;
      endDate?: string;
    }): Promise<string> => {
      const id = genId();
      const [yStr, mStr] = goal.month.split("-");
      const y = parseInt(yStr, 10);
      const m = parseInt(mStr, 10);
      const lastDay = new Date(y, m, 0).getDate();

      const start = goal.startDate || `${goal.month}-01`;
      const end =
        goal.endDate || `${goal.month}-${String(lastDay).padStart(2, "0")}`;
      const todayStr = today();
      const earned = calculateEarnedForRange(orders, start, end);
      const isExpired = todayStr > end;

      // Immediate completion if target reached, otherwise missed if expired, or in_progress
      let status: GoalStatus = "in_progress";
      if (earned >= goal.targetAmount) {
        status = "achieved";
      } else if (isExpired) {
        status = "missed";
      }

      const now = new Date().toISOString();
      const title = goal.title?.trim() || "Monthly Goal";

      const newGoal: MonthlyGoal = {
        id,
        title,
        month: goal.month,
        targetAmount: goal.targetAmount,
        earnedAmount: earned,
        startDate: start,
        endDate: end,
        status,
        createdAt: now,
        updatedAt: now,
      };

      if (!IS_WEB && db) {
        db.runSync(
          "INSERT INTO monthly_goals (id,title,month,targetAmount,earnedAmount,startDate,endDate,status,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?)",
          [
            id,
            title,
            goal.month,
            goal.targetAmount,
            earned,
            start,
            end,
            status,
            now,
            now,
          ],
        );
      }

      const nextGoals = [newGoal, ...goals].sort(
        (a, b) =>
          b.month.localeCompare(a.month) ||
          b.createdAt.localeCompare(a.createdAt),
      );
      await persistGoals(nextGoals);
      return id;
    },
    [goals, orders],
  );

  const updateMonthlyGoal = useCallback(
    async (id: string, updates: Partial<MonthlyGoal>) => {
      const existing = goals.find((g) => g.id === id);
      if (!existing) return;

      const start = updates.startDate || existing.startDate;
      const end = updates.endDate || existing.endDate;
      const target =
        updates.targetAmount !== undefined
          ? updates.targetAmount
          : existing.targetAmount;
      const todayStr = today();
      const earned = calculateEarnedForRange(orders, start, end);
      const isExpired = todayStr > end;

      let computedStatus: GoalStatus = "in_progress";
      if (earned >= target) {
        computedStatus = "achieved";
      } else if (isExpired) {
        computedStatus = "missed";
      }

      const status = updates.status || computedStatus;
      const now = new Date().toISOString();

      const updated: MonthlyGoal = {
        ...existing,
        ...updates,
        earnedAmount: earned,
        startDate: start,
        endDate: end,
        status,
        updatedAt: now,
      };

      if (!IS_WEB && db) {
        db.runSync(
          "UPDATE monthly_goals SET title=?, month=?, targetAmount=?, earnedAmount=?, startDate=?, endDate=?, status=?, updatedAt=? WHERE id=?",
          [
            updated.title || "Monthly Goal",
            updated.month,
            updated.targetAmount,
            updated.earnedAmount,
            updated.startDate,
            updated.endDate,
            updated.status,
            updated.updatedAt,
            id,
          ],
        );
      }

      const nextGoals = goals.map((g) => (g.id === id ? updated : g));
      await persistGoals(nextGoals);
    },
    [goals, orders],
  );

  const getGoalsByMonth = useCallback(
    (month: string) => {
      return goals.filter((g) => g.month === month);
    },
    [goals],
  );

  const getMonthlyGoal = useCallback(
    (month: string) => {
      return goals.find((g) => g.month === month);
    },
    [goals],
  );

  const setMonthlyGoal = useCallback(
    async (
      month: string,
      targetAmount: number,
      startDate?: string,
      endDate?: string,
      title?: string,
    ): Promise<MonthlyGoal> => {
      const existing = goals.find((g) => g.month === month);
      if (existing) {
        await updateMonthlyGoal(existing.id, {
          targetAmount,
          startDate,
          endDate,
          title: title || existing.title,
        });
        return {
          ...existing,
          targetAmount,
          startDate: startDate || existing.startDate,
          endDate: endDate || existing.endDate,
          title: title || existing.title,
        };
      } else {
        const newId = await addMonthlyGoal({
          month,
          targetAmount,
          startDate,
          endDate,
          title,
        });
        return {
          id: newId,
          title: title || "Monthly Goal",
          month,
          targetAmount,
          earnedAmount: 0,
          startDate: startDate || `${month}-01`,
          endDate: endDate || `${month}-30`,
          status: "in_progress",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }
    },
    [goals, addMonthlyGoal, updateMonthlyGoal],
  );

  const deleteMonthlyGoal = useCallback(
    async (id: string) => {
      if (!IS_WEB && db) {
        db.runSync("DELETE FROM monthly_goals WHERE id=?", [id]);
      }
      await persistGoals(goals.filter((g) => g.id !== id));
    },
    [goals],
  );

  const saveUser = useCallback(async (newUser: User) => {
    if (!IS_WEB && db) {
      db.runSync(
        `INSERT OR REPLACE INTO user (id, userName, emailId, role, createdAt, updatedAt, access_token, refresh_token) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newUser.id,
          newUser.userName,
          newUser.emailId,
          newUser.role || "user",
          newUser.createdAt || new Date().toISOString(),
          newUser.updatedAt || new Date().toISOString(),
          newUser.access_token || "",
          newUser.refresh_token || "",
        ],
      );
    }
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(newUser));
    setUser(newUser);
    userRef.current = newUser;

    // Trigger sync for any pending offline orders now that user has valid tokens
    if (newUser.access_token && newUser.refresh_token) {
      triggerBackgroundSyncRef.current();
    }
  }, []);

  const clearUser = useCallback(async () => {
    if (!IS_WEB && db) {
      db.runSync("DELETE FROM user");
    }
    await AsyncStorage.removeItem(USER_KEY);
    setUser(null);
    userRef.current = null;
  }, []);

  return (
    <DatabaseContext.Provider
      value={{
        orders,
        products,
        customers,
        expenses,
        goals,
        user,
        loading,
        saveUser,
        clearUser,
        addOrder,
        updateOrder,
        deleteOrder,
        getOrder,
        toggleWorkingOn,
        addProduct,
        updateProduct,
        deleteProduct,
        addCustomer,
        updateCustomer,
        findCustomerByIg,
        findCustomerByPhone,
        findProductByName,
        clearDeliveredImages,
        importBackup,
        addExpense,
        updateExpense,
        deleteExpense,
        addMonthlyGoal,
        updateMonthlyGoal,
        deleteMonthlyGoal,
        getGoalsByMonth,
        getMonthlyGoal,
        setMonthlyGoal,
        snapshotExpiredGoals,
        syncOrderNow,
        syncAllPendingOrders,
        reconcileWithOnlineDb: checkAndReconcileWithOnlineDb,
        syncProgress,
        syncedCount,
        totalOrdersCount,
        syncPercentage,
      }}
    >
      {children}
    </DatabaseContext.Provider>
  );
}

export function useDatabase() {
  const ctx = useContext(DatabaseContext);
  if (!ctx) throw new Error("useDatabase must be used within DatabaseProvider");
  return ctx;
}
