import { Order } from '@/types';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

function escape(val: string | number | undefined): string {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildCSV(orders: Order[]): string {
  const headers = [
    'ID', 'Source', 'Customer Name', 'Contact Info', 'Order Date', 'Due Date',
    'Product', 'Price', 'Payment Status', 'Amount Paid', 'Order Status',
    'Tracking Link', 'Notes'
  ];

  const rows = orders.map(o => [
    escape(o.id),
    escape(o.source),
    escape(o.customerName),
    escape(o.contactInfo),
    escape(o.orderDate),
    escape(o.dueDate),
    escape(o.customName),
    escape(o.price),
    escape(o.paymentStatus),
    escape(o.amountPaid),
    escape(o.status),
    escape(o.trackingLink),
    escape(o.notes),
  ]);

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

export async function exportCSV(orders: Order[]) {
  if (Platform.OS === 'web') {
    const csv = buildCSV(orders);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orders_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  const csv = buildCSV(orders);
  const path = `${FileSystem.cacheDirectory}orders_${Date.now()}.csv`;
  await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });

  const isAvailable = await Sharing.isAvailableAsync();
  if (isAvailable) {
    await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: 'Export Orders CSV' });
  }
}

export async function exportBackup(orders: Order[], products: any[]) {
  const data = JSON.stringify({ orders, products, exportedAt: new Date().toISOString() }, null, 2);

  if (Platform.OS === 'web') {
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orderflow_backup_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  const path = `${FileSystem.cacheDirectory}orderflow_backup_${Date.now()}.json`;
  await FileSystem.writeAsStringAsync(path, data, { encoding: FileSystem.EncodingType.UTF8 });
  const isAvailable = await Sharing.isAvailableAsync();
  if (isAvailable) {
    await Sharing.shareAsync(path, { mimeType: 'application/json', dialogTitle: 'Export Backup' });
  }
}
