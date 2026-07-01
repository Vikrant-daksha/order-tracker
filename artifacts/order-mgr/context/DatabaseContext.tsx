import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';
import { Order, OrderSource, OrderStatus, PaymentStatus, Product, Customer } from '@/types';
import AsyncStorage from '@react-native-async-storage/async-storage';

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
}

const today = () => new Date().toISOString().split('T')[0];

interface DatabaseContextType {
  orders: Order[];
  products: Product[];
  customers: Customer[];
  loading: boolean;
  addOrder: (order: Omit<Order, 'id' | 'createdAt'>) => Promise<string>;
  updateOrder: (id: string, updates: Partial<Order>) => Promise<void>;
  deleteOrder: (id: string) => Promise<void>;
  getOrder: (id: string) => Order | undefined;
  toggleWorkingOn: (id: string) => Promise<void>;
  addProduct: (product: Omit<Product, 'id'>) => Promise<string>;
  updateProduct: (id: string, updates: Partial<Product>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  findProductByName: (name: string) => Product | undefined;
  addCustomer: (customer: Omit<Customer, 'id' | 'createdAt'>) => Promise<string>;
  updateCustomer: (id: string, updates: Partial<Customer>) => Promise<void>;
  findCustomerByIg: (ig: string) => Customer | undefined;
  findCustomerByPhone: (phone: string) => Customer | undefined;
  clearDeliveredImages: () => Promise<number>;
  importBackup: (data: { orders: Order[]; products: Product[]; customers?: Customer[] }) => Promise<void>;
}

const DatabaseContext = createContext<DatabaseContextType | null>(null);

const IS_WEB = Platform.OS === 'web';
const ORDERS_KEY = '@orderflow_orders';
const PRODUCTS_KEY = '@orderflow_products';
const CUSTOMERS_KEY = '@orderflow_customers';

let db: SQLite.SQLiteDatabase | null = null;

function initDb() {
  if (IS_WEB || db) return;
  db = SQLite.openDatabaseSync('orderflow.db');
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
      customerId TEXT DEFAULT ''
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
      createdAt TEXT DEFAULT ''
    );
  `);
  // Migration: add missing columns if they don't exist yet
  try { db.execSync(`ALTER TABLE orders ADD COLUMN address TEXT DEFAULT ''`); } catch {}
  try { db.execSync(`ALTER TABLE orders ADD COLUMN size TEXT DEFAULT ''`); } catch {}
  try { db.execSync(`ALTER TABLE orders ADD COLUMN customerId TEXT DEFAULT ''`); } catch {}
  try { db.execSync(`ALTER TABLE orders ADD COLUMN workingOn INTEGER DEFAULT 0`); } catch {}
}

function loadOrdersFromDb(): Order[] {
  if (IS_WEB || !db) return [];
  try {
    return db.getAllSync<Order>('SELECT * FROM orders ORDER BY createdAt DESC');
  } catch {
    return [];
  }
}

function loadProductsFromDb(): Product[] {
  if (IS_WEB || !db) return [];
  try {
    return db.getAllSync<Product>('SELECT * FROM products ORDER BY name ASC');
  } catch {
    return [];
  }
}

function loadCustomersFromDb(): Customer[] {
  if (IS_WEB || !db) return [];
  try {
    return db.getAllSync<Customer>('SELECT * FROM customers ORDER BY createdAt DESC');
  } catch {
    return [];
  }
}

export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      try {
        if (IS_WEB) {
          const [os, ps, cs] = await Promise.all([
            AsyncStorage.getItem(ORDERS_KEY),
            AsyncStorage.getItem(PRODUCTS_KEY),
            AsyncStorage.getItem(CUSTOMERS_KEY),
          ]);
          setOrders(os ? JSON.parse(os) : []);
          setProducts(ps ? JSON.parse(ps) : []);
          setCustomers(cs ? JSON.parse(cs) : []);
        } else {
          initDb();
          let loadedOrders = loadOrdersFromDb();
          let loadedCustomers = loadCustomersFromDb();
          
          if (loadedCustomers.length === 0 && loadedOrders.length > 0 && db) {
            const map: Record<string, any> = {};
            for (const o of loadedOrders) {
              const key = o.customerName?.trim() || 'Unknown';
              if (!map[key]) {
                const igMatch = o.contactInfo?.match(/@[\w.]+/);
                const pMatch = o.contactInfo?.match(/\+?[0-9\s-]{10,}/);
                const eMatch = o.contactInfo?.match(/[\w.-]+@[\w.-]+\.\w+/);
                map[key] = {
                  id: genId(),
                  name: key,
                  igHandle: igMatch ? igMatch[0].replace('@', '') : '',
                  phone: pMatch ? pMatch[0].replace(/[^0-9+]/g, '') : '',
                  email: eMatch ? eMatch[0] : '',
                  address: o.address || '',
                  createdAt: o.createdAt || new Date().toISOString()
                };
              }
              o.customerId = map[key].id;
              db.runSync('UPDATE orders SET customerId=? WHERE id=?', [o.customerId || null, o.id]);
            }
            const newCustomers = Object.values(map);
            for (const c of newCustomers as any[]) {
              db.runSync(
                'INSERT INTO customers (id,name,igHandle,phone,email,address,createdAt) VALUES (?,?,?,?,?,?,?)',
                [c.id, c.name, c.igHandle, c.phone, c.email, c.address, c.createdAt]
              );
            }
            loadedCustomers = newCustomers;
          }
          setOrders(loadedOrders);
          setProducts(loadProductsFromDb());
          setCustomers(loadedCustomers);
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

  const addOrder = useCallback(async (order: Omit<Order, 'id' | 'createdAt'>): Promise<string> => {
    const id = genId();
    const createdAt = new Date().toISOString();
    const full: Order = { ...order, id, createdAt } as Order;

    if (!IS_WEB && db) {
      db.runSync(
        `INSERT INTO orders (id,source,customerName,contactInfo,address,orderDate,dueDate,productId,customName,referenceImagePath,thumbnailPath,price,paymentStatus,amountPaid,status,trackingLink,notes,createdAt,isCustom,size,customerId)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id, full.source, full.customerName, full.contactInfo, full.address ?? '', full.orderDate, full.dueDate,
         full.productId, full.customName, full.referenceImagePath, full.thumbnailPath,
         full.price, full.paymentStatus, full.amountPaid, full.status,
         full.trackingLink, full.notes, createdAt, full.isCustom ? 1 : 0, full.size ?? '', full.customerId ?? '']
      );
    }
    await persistOrders([full, ...orders]);
    return id;
  }, [orders]);

  const updateOrder = useCallback(async (id: string, updates: Partial<Order>) => {
    const next = orders.map(o => o.id === id ? { ...o, ...updates } : o);
    if (!IS_WEB && db) {
      const u = updates;
      const fields = Object.keys(u).filter(k => k !== 'id' && k !== 'createdAt');
      if (fields.length > 0) {
        const set = fields.map(f => `${f}=?`).join(',');
        const vals = fields.map(f => (u as any)[f]);
        db.runSync(`UPDATE orders SET ${set} WHERE id=?`, [...vals, id]);
      }
    }
    await persistOrders(next);
  }, [orders]);

  const deleteOrder = useCallback(async (id: string) => {
    const next = orders.filter(o => o.id !== id);
    if (!IS_WEB && db) db.runSync('DELETE FROM orders WHERE id=?', [id]);
    await persistOrders(next);
  }, [orders]);

  const getOrder = useCallback((id: string) => orders.find(o => o.id === id), [orders]);

  const toggleWorkingOn = useCallback(async (id: string) => {
    const order = orders.find(o => o.id === id);
    if (!order) return;
    const next = order.workingOn ? 0 : 1;
    await updateOrder(id, { workingOn: next });
  }, [orders, updateOrder]);

  const addProduct = useCallback(async (product: Omit<Product, 'id'>): Promise<string> => {
    const id = genId();
    const full: Product = { ...product, id } as Product;
    if (!IS_WEB && db) {
      db.runSync(
        'INSERT INTO products (id,name,imagePath,thumbnailPath,defaultPrice,category) VALUES (?,?,?,?,?,?)',
        [id, full.name, full.imagePath, full.thumbnailPath, full.defaultPrice, full.category]
      );
    }
    await persistProducts([...products, full].sort((a, b) => a.name.localeCompare(b.name)));
    return id;
  }, [products]);

  const updateProduct = useCallback(async (id: string, updates: Partial<Product>) => {
    const next = products.map(p => p.id === id ? { ...p, ...updates } : p);
    if (!IS_WEB && db) {
      const fields = Object.keys(updates).filter(k => k !== 'id');
      if (fields.length > 0) {
        const set = fields.map(f => `${f}=?`).join(',');
        const vals = fields.map(f => (updates as any)[f]);
        db.runSync(`UPDATE products SET ${set} WHERE id=?`, [...vals, id]);
      }
    }
    await persistProducts(next);
  }, [products]);

  const deleteProduct = useCallback(async (id: string) => {
    const next = products.filter(p => p.id !== id);
    if (!IS_WEB && db) db.runSync('DELETE FROM products WHERE id=?', [id]);
    await persistProducts(next);
  }, [products]);


  const addCustomer = useCallback(async (customer: Omit<Customer, 'id' | 'createdAt'>): Promise<string> => {
    const id = genId();
    const createdAt = new Date().toISOString();
    const full: Customer = { ...customer, id, createdAt } as Customer;
    if (!IS_WEB && db) {
      db.runSync(
        'INSERT INTO customers (id,name,igHandle,phone,email,address,createdAt) VALUES (?,?,?,?,?,?,?)',
        [id, full.name, full.igHandle, full.phone, full.email, full.address, createdAt]
      );
    }
    await persistCustomers([...customers, full].sort((a,b) => a.name.localeCompare(b.name)));
    return id;
  }, [customers]);

  const updateCustomer = useCallback(async (id: string, updates: Partial<Customer>) => {
    const next = customers.map(c => c.id === id ? { ...c, ...updates } : c);
    if (!IS_WEB && db) {
      const fields = Object.keys(updates).filter(k => k !== 'id' && k !== 'createdAt');
      if (fields.length > 0) {
        const set = fields.map(f => `${f}=?`).join(',');
        const vals = fields.map(f => (updates as any)[f]);
        db.runSync(`UPDATE customers SET ${set} WHERE id=?`, [...vals, id]);
      }
    }
    await persistCustomers(next);
  }, [customers]);

  const findCustomerByIg = useCallback((ig: string) => {
    if (!ig) return undefined;
    const search = ig.replace('@', '').toLowerCase().trim();
    return customers.find(c => c.igHandle?.toLowerCase() === search);
  }, [customers]);

  const findCustomerByPhone = useCallback((phone: string) => {
    if (!phone) return undefined;
    const search = phone.replace(/[^0-9+]/g, '');
    return customers.find(c => c.phone && search.includes(c.phone.replace(/[^0-9]/g, '')) || c.phone?.replace(/[^0-9]/g, '').includes(search.replace(/[^0-9]/g, '')));
  }, [customers]);

  const findProductByName = useCallback((name: string) => {
    const lower = name.toLowerCase();
    return products.find(p => p.name.toLowerCase().includes(lower));
  }, [products]);

  const clearDeliveredImages = useCallback(async (): Promise<number> => {
    const delivered = orders.filter(o => o.status === 'Delivered' && (o.referenceImagePath || o.thumbnailPath));
    let count = 0;
    for (const o of delivered) {
      if (o.referenceImagePath || o.thumbnailPath) {
        await updateOrder(o.id, { referenceImagePath: '', thumbnailPath: '' });
        count++;
      }
    }
    return count;
  }, [orders, updateOrder]);

  const importBackup = useCallback(async (data: { orders: Order[]; products: Product[] }) => {
    if (!IS_WEB && db) {
      db.execSync('DELETE FROM orders; DELETE FROM products;');
      for (const o of data.orders) {
        db.runSync(
          `INSERT OR REPLACE INTO orders (id,source,customerName,contactInfo,address,orderDate,dueDate,productId,customName,referenceImagePath,thumbnailPath,price,paymentStatus,amountPaid,status,trackingLink,notes,createdAt,isCustom,size) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [o.id, o.source, o.customerName, o.contactInfo, o.address ?? '', o.orderDate, o.dueDate,
           o.productId, o.customName, o.referenceImagePath, o.thumbnailPath,
           o.price, o.paymentStatus, o.amountPaid, o.status,
           o.trackingLink, o.notes, o.createdAt, o.isCustom ? 1 : 0, o.size ?? '']
        );
      }
      for (const p of data.products) {
        db.runSync(
          'INSERT OR REPLACE INTO products (id,name,imagePath,thumbnailPath,defaultPrice,category) VALUES (?,?,?,?,?,?)',
          [p.id, p.name, p.imagePath, p.thumbnailPath, p.defaultPrice, p.category]
        );
      }
    }
    await persistOrders(data.orders);
    await persistProducts(data.products);
  }, []);

  return (
    <DatabaseContext.Provider value={{
      orders, products, customers, loading,
      addOrder, updateOrder, deleteOrder, getOrder, toggleWorkingOn,
      addProduct, updateProduct, deleteProduct,
      addCustomer, updateCustomer, findCustomerByIg, findCustomerByPhone,
      findProductByName, clearDeliveredImages, importBackup,
    }}>
      {children}
    </DatabaseContext.Provider>
  );
}

export function useDatabase() {
  const ctx = useContext(DatabaseContext);
  if (!ctx) throw new Error('useDatabase must be used within DatabaseProvider');
  return ctx;
}
