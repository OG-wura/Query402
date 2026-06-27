import { WalletAdapter, WalletState, WalletStatus } from "./types.js";

type Subscriber = (state: WalletState) => void;

export class WalletSessionMachine {
  private adapter: WalletAdapter | null = null;
  private state: WalletState = { status: "disconnected" };
  private subscribers: Set<Subscriber> = new Set();
  private targetNetworkPassphrase?: string;
  private unwatch: (() => void) | null = null;

  constructor(targetNetworkPassphrase?: string) {
    this.targetNetworkPassphrase = targetNetworkPassphrase;
  }

  getState(): WalletState {
    return this.state;
  }

  getAdapter(): WalletAdapter | null {
    return this.adapter;
  }

  subscribe(callback: Subscriber): () => void {
    this.subscribers.add(callback);
    callback(this.state);
    return () => this.subscribers.delete(callback);
  }

  private setState(newState: Partial<WalletState>) {
    this.state = { ...this.state, ...newState };
    for (const sub of this.subscribers) {
      sub(this.state);
    }
  }

  setAdapter(adapter: WalletAdapter) {
    this.disconnect(); // cleanup old adapter
    this.adapter = adapter;

    // Test capabilities early if needed, though they are static on the adapter
    if (!adapter.capabilities.canSignTransaction || !adapter.capabilities.canSignAuthEntry) {
      this.setState({
        status: "unsupported",
        error: "Wallet does not support required Stellar x402 signing capabilities"
      });
      return;
    }

    this.unwatch = adapter.watchChanges((newState) => {
      // Re-evaluate supported capabilities when state changes if needed
      if (
        newState.status === "connected" &&
        (!adapter.capabilities.canSignTransaction || !adapter.capabilities.canSignAuthEntry)
      ) {
        this.setState({
          status: "unsupported",
          error: "Wallet does not support required Stellar x402 signing capabilities"
        });
        return;
      }
      this.setState(newState);
    }, this.targetNetworkPassphrase);

    // Initial check
    adapter.checkState(this.targetNetworkPassphrase).then((newState) => {
      if (
        newState.status === "connected" &&
        (!adapter.capabilities.canSignTransaction || !adapter.capabilities.canSignAuthEntry)
      ) {
        this.setState({
          status: "unsupported",
          error: "Wallet does not support required Stellar x402 signing capabilities"
        });
        return;
      }
      this.setState(newState);
    });
  }

  async connect() {
    if (!this.adapter) throw new Error("No adapter set");
    if (this.state.status === "connecting" || this.state.status === "signing") return;

    this.setState({ status: "connecting", error: undefined });

    try {
      const result = await this.adapter.connect(this.targetNetworkPassphrase);

      if (
        result.status === "connected" &&
        (!this.adapter.capabilities.canSignTransaction ||
          !this.adapter.capabilities.canSignAuthEntry)
      ) {
        this.setState({
          status: "unsupported",
          error: "Wallet does not support required Stellar x402 signing capabilities"
        });
        return;
      }

      this.setState(result);
    } catch (e: any) {
      this.setState({ status: "disconnected", error: e.message });
    }
  }

  async disconnect() {
    if (this.unwatch) {
      this.unwatch();
      this.unwatch = null;
    }
    if (this.adapter) {
      await this.adapter.disconnect();
    }
    this.setState({
      status: "disconnected",
      address: undefined,
      network: undefined,
      error: undefined
    });
  }

  async signTransaction(xdr: string, opts?: { networkPassphrase?: string }) {
    if (!this.adapter) throw new Error("No adapter set");
    if (this.state.status !== "connected") throw new Error("Wallet not connected");

    const prevState = this.state.status;
    this.setState({ status: "signing", error: undefined });

    try {
      const result = await this.adapter.signTransaction(xdr, opts);
      this.setState({ status: prevState }); // restore connected
      return result;
    } catch (e: any) {
      const isReject = e.message.toLowerCase().includes("reject");
      this.setState({ status: isReject ? "rejected" : prevState, error: e.message });
      throw e;
    }
  }

  async signAuthEntry(xdr: string, opts?: { networkPassphrase?: string }) {
    if (!this.adapter) throw new Error("No adapter set");
    if (this.state.status !== "connected") throw new Error("Wallet not connected");

    const prevState = this.state.status;
    this.setState({ status: "signing", error: undefined });

    try {
      const result = await this.adapter.signAuthEntry(xdr, opts);
      this.setState({ status: prevState }); // restore connected
      return result;
    } catch (e: any) {
      const isReject = e.message.toLowerCase().includes("reject");
      this.setState({ status: isReject ? "rejected" : prevState, error: e.message });
      throw e;
    }
  }
}
