import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';
import { Order, OrderSource, OrderStatus, PaymentStatus, Product } from '@/types';
import AsyncStorage from '@react-native-async-storage/async-storage';

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
}

const today = () => new Date().toISOString().split('T')[0];

interface DatabaseContextType {
  orders: Order[];
  products: Product[];
  loading: boolean;
  addOrder: (order: Omit<Order, 'id' | 'createdAt'>) => Promise<string>;
  updateOrder: (id: string, updates: Partial<Order>) => Promise<void>;
  deleteOrder: (id: string) => Promise<void>;
  getOrder: (id: string) => Order | undefined;
  addProduct: (product: Omit<Product, 'id'>) => Promise<string>;
  updateProduct: (id: string, updates: Partial<Product>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  findProductByName: (name: string) => Product | undefined;
  clearDeliveredImages: () => Promise<number>;
  importBackup: (data: { orders: Order[]; products: Product[] }) => Promise<void>;
}

const DatabaseContext = createContext<DatabaseContextType | null>(null);

const IS_WEB = Platform.OS === 'web';
const ORDERS_KEY = '@orderflow_orders';
const PRODUCTS_KEY = '@orderflow_products';

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
      isCustom INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      imagePath TEXT DEFAULT '',
      thumbnailPath TEXT DEFAULT '',
      defaultPrice REAL DEFAULT 0,
      category TEXT DEFAULT ''
    );
  `);
  // Migration: add address column if it doesn't exist yet
  try { db.execSync(`ALTER TABLE orders ADD COLUMN address TEXT DEFAULT ''`); } catch {}
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

export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      try {
        if (IS_WEB) {
          const [os, ps] = await Promise.all([
            AsyncStorage.getItem(ORDERS_KEY),
            AsyncStorage.getItem(PRODUCTS_KEY),
          ]);
          setOrders(os ? JSON.parse(os) : []);
          setProducts(ps ? JSON.parse(ps) : []);
        } else {
          initDb();
          setOrders(loadOrdersFromDb());
          setProducts(loadProductsFromDb());
        }
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

  const addOrder = useCallback(async (order: Omit<Order, 'id' | 'createdAt'>): Promise<string> => {
    const id = genId();
    const createdAt = new Date().toISOString();
    const full: Order = { ...order, id, createdAt } as Order;

    if (!IS_WEB && db) {
      db.runSync(
        `INSERT INTO orders (id,source,customerName,contactInfo,address,orderDate,dueDate,productId,customName,referenceImagePath,thumbnailPath,price,paymentStatus,amountPaid,status,trackingLink,notes,createdAt,isCustom)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id, full.source, full.customerName, full.contactInfo, full.address ?? '', full.orderDate, full.dueDate,
         full.productId, full.customName, full.referenceImagePath, full.thumbnailPath,
         full.price, full.paymentStatus, full.amountPaid, full.status,
         full.trackingLink, full.notes, createdAt, full.isCustom ? 1 : 0]
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
          `INSERT OR REPLACE INTO orders (id,source,customerName,contactInfo,address,orderDate,dueDate,productId,customName,referenceImagePath,thumbnailPath,price,paymentStatus,amountPaid,status,trackingLink,notes,createdAt,isCustom) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [o.id, o.source, o.customerName, o.contactInfo, o.address ?? '', o.orderDate, o.dueDate,
           o.productId, o.customName, o.referenceImagePath, o.thumbnailPath,
           o.price, o.paymentStatus, o.amountPaid, o.status,
           o.trackingLink, o.notes, o.createdAt, o.isCustom ? 1 : 0]
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
      orders, products, loading,
      addOrder, updateOrder, deleteOrder, getOrder,
      addProduct, updateProduct, deleteProduct,
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
