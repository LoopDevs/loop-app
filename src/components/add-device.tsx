import { WalletStep } from '@/components/wallet-step';
import type { SmartWallet } from '@/wallet/smart-wallet';

export function AddDevice({ wallet, onAdded }: { wallet: SmartWallet; onAdded: () => Promise<void> }) {
  return (
    <WalletStep
      title="Use Loop on this device"
      body="You’ll confirm it’s you with Face ID, your fingerprint or your screen lock. You can then pay from this device only. To pay from another device again, set it up again there."
      label="Continue"
      busyLabel="Setting up…"
      run={(signal) => wallet.addThisDevice(signal)}
      onDone={onAdded}
    />
  );
}
