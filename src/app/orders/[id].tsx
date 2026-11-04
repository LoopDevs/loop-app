import { Redirect, useLocalSearchParams } from 'expo-router';

export default function OrderReturnScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={`/wallet/${id}`} />;
}
