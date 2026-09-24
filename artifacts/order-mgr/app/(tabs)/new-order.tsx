import { useEffect } from 'react';
import { useRouter } from 'expo-router';

export default function NewOrderTab() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/order/new' as any);
  }, []);

  return null;
}
