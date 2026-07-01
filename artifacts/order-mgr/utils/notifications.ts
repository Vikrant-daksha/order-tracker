import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function isNotificationEnabledAppLevel(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem('@orderflow_notifications_enabled');
    return val !== 'false';
  } catch {
    return true;
  }
}

export async function toggleNotificationAppLevel(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem('@orderflow_notifications_enabled', enabled ? 'true' : 'false');
  if (!enabled) {
    await Notifications.cancelAllScheduledNotificationsAsync();
  }
}

function reminderKey(orderId: string) {
  return `${orderId}_due_2d`;
}

export async function scheduleOrderReminder(
  orderId: string,
  customerName: string,
  productName: string,
  dueDate: string
): Promise<void> {
  if (Platform.OS === 'web') return;

  const appEnabled = await isNotificationEnabledAppLevel();
  if (!appEnabled) return;

  await cancelOrderReminder(orderId);

  if (!dueDate) return;

  const due = new Date(`${dueDate}T00:00:00`);
  const reminder = new Date(due);
  reminder.setDate(due.getDate() - 2);
  reminder.setHours(10, 0, 0, 0);

  if (reminder <= new Date()) return;

  try {
    await Notifications.scheduleNotificationAsync({
      identifier: reminderKey(orderId),
      content: {
        title: '📦 Order Due in 2 Days',
        body: `${customerName}'s order${productName ? ` for "${productName}"` : ''} is due on ${dueDate}.`,
        data: { orderId },
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: reminder,
      },
    });
  } catch (e) {
    console.warn('Failed to schedule notification:', e);
  }
}

export async function cancelOrderReminder(orderId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.cancelScheduledNotificationAsync(reminderKey(orderId));
  } catch { }
}

export async function rescheduleAllReminders(
  orders: Array<{ id: string; customerName: string; customName: string; dueDate: string; status: string }>
): Promise<void> {
  if (Platform.OS === 'web') return;
  await Notifications.cancelAllScheduledNotificationsAsync();
  for (const o of orders) {
    if (o.status !== 'Delivered' && o.dueDate) {
      await scheduleOrderReminder(o.id, o.customerName, o.customName, o.dueDate);
    }
  }
}
