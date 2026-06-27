export type WalletStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "wrong-network"
  | "unsupported"
  | "signing"
  | "rejected";

/**
 * Supported capability matrix. Defines which signing capabilities the
 * underlying wallet extension currently supports.
 */
export interface WalletCapabilities {
  canSignTransaction: boolean;
  canSignAuthEntry: boolean;
}

export interface WalletState {
  status: WalletStatus;
  address?: string;
  network?: string; // e.g. "TESTNET", "PUBLIC", or network passphrase
  error?: string;
}

export interface WalletAdapter {
  readonly id: string;
  readonly name: string;
  readonly capabilities: WalletCapabilities;

  /** Connect to the wallet */
  connect(targetNetworkPassphrase?: string): Promise<WalletState>;

  /** Disconnect from the wallet */
  disconnect(): Promise<void>;

  /** Refresh state, check network matches target */
  checkState(targetNetworkPassphrase?: string): Promise<WalletState>;

  /** Sign a transaction */
  signTransaction(
    xdr: string,
    opts?: { networkPassphrase?: string }
  ): Promise<{ signedTxXdr: string; signerAddress: string }>;

  /** Sign an authorization entry */
  signAuthEntry(
    xdr: string,
    opts?: { networkPassphrase?: string }
  ): Promise<{ signedAuthEntry: string; signerAddress: string }>;

  /** Listen for account or network changes */
  watchChanges(
    callback: (state: WalletState) => void,
    targetNetworkPassphrase?: string
  ): () => void;
}
