import { WalletStep } from '@/components/wallet-step';
import type { SmartWallet } from '@/wallet/smart-wallet';

export function ConfirmIdentity({ wallet, onConfirmed }: { wallet: SmartWallet; onConfirmed: () => Promise<void> }) {
  return (
    <WalletStep
      title="Confirm it’s you"
      body="Confirm it’s you to see and use your balance in this browser. You’ll do this each time you open Loop here."
      label="Confirm it’s you"
      busyLabel="Confirming…"
      run={() => wallet.confirmIdentity()}
      onDone={onConfirmed}
    />
  );
}
