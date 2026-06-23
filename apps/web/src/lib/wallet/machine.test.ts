import { test, describe } from "node:test";
import assert from "node:assert";
import { WalletSessionMachine } from "./machine.js";
import { WalletAdapter, WalletState, WalletStatus } from "./types.js";

class FakeAdapter implements WalletAdapter {
  id = "fake";
  name = "Fake Wallet";
  capabilities = {
    canSignTransaction: true,
    canSignAuthEntry: true,
  };
  
  mockState: WalletState = { status: "disconnected" };
  mockRejectSign = false;

  private watcherCb?: (state: WalletState) => void;

  async connect(targetNetworkPassphrase?: string): Promise<WalletState> {
    if (this.mockState.status === "wrong-network") {
      return this.mockState;
    }
    this.mockState = { status: "connected", address: "GABC123", network: targetNetworkPassphrase || "TESTNET" };
    if (this.watcherCb) this.watcherCb(this.mockState);
    return this.mockState;
  }
  
  async disconnect(): Promise<void> {
    this.mockState = { status: "disconnected" };
    if (this.watcherCb) this.watcherCb(this.mockState);
  }

  async checkState(targetNetworkPassphrase?: string): Promise<WalletState> {
    return this.mockState;
  }

  async signTransaction(xdr: string, opts?: { networkPassphrase?: string }) {
    if (this.mockRejectSign) throw new Error("User rejected");
    return { signedTxXdr: "signed_" + xdr, signerAddress: "GABC123" };
  }

  async signAuthEntry(xdr: string, opts?: { networkPassphrase?: string }) {
    if (this.mockRejectSign) throw new Error("User rejected");
    return { signedAuthEntry: "signed_" + xdr, signerAddress: "GABC123" };
  }

  watchChanges(callback: (state: WalletState) => void, targetNetworkPassphrase?: string): () => void {
    this.watcherCb = callback;
    return () => { this.watcherCb = undefined; };
  }

  // Helper for test to simulate external changes
  simulateNetworkChange(network: string, targetPassphrase?: string) {
    if (network !== targetPassphrase) {
       this.mockState = { status: "wrong-network", address: "GABC123", network, error: "Wrong network" };
    } else {
       this.mockState = { status: "connected", address: "GABC123", network };
    }
    if (this.watcherCb) this.watcherCb(this.mockState);
  }
}

describe("WalletSessionMachine", () => {
  test("connects and sets state correctly", async () => {
    const machine = new WalletSessionMachine("TESTNET");
    const adapter = new FakeAdapter();
    machine.setAdapter(adapter);
    
    assert.strictEqual(machine.getState().status, "disconnected");
    
    await machine.connect();
    
    assert.strictEqual(machine.getState().status, "connected");
    assert.strictEqual(machine.getState().address, "GABC123");
  });

  test("handles unsupported wallet", async () => {
    const machine = new WalletSessionMachine("TESTNET");
    const adapter = new FakeAdapter();
    adapter.capabilities.canSignAuthEntry = false; // unsupported
    machine.setAdapter(adapter);
    
    await machine.connect();
    assert.strictEqual(machine.getState().status, "unsupported");
  });

  test("handles wrong network", async () => {
    const machine = new WalletSessionMachine("PUBLIC");
    const adapter = new FakeAdapter();
    adapter.mockState = { status: "wrong-network", error: "Wrong network", address: "GABC123", network: "TESTNET" };
    machine.setAdapter(adapter);
    
    await machine.connect();
    assert.strictEqual(machine.getState().status, "wrong-network");
  });

  test("transitions to signing and back", async () => {
    const machine = new WalletSessionMachine("TESTNET");
    const adapter = new FakeAdapter();
    machine.setAdapter(adapter);
    await machine.connect();
    
    const promise = machine.signTransaction("tx_xdr");
    assert.strictEqual(machine.getState().status, "signing");
    await promise;
    assert.strictEqual(machine.getState().status, "connected");
  });

  test("handles user rejection during signing", async () => {
    const machine = new WalletSessionMachine("TESTNET");
    const adapter = new FakeAdapter();
    machine.setAdapter(adapter);
    await machine.connect();
    
    adapter.mockRejectSign = true;
    try {
      await machine.signTransaction("tx_xdr");
      assert.fail("Should throw");
    } catch (e) {
      assert.strictEqual(machine.getState().status, "rejected");
    }
  });

  test("detects account/network changes via watcher", async () => {
    const machine = new WalletSessionMachine("TESTNET");
    const adapter = new FakeAdapter();
    machine.setAdapter(adapter);
    await machine.connect();
    
    assert.strictEqual(machine.getState().status, "connected");
    
    adapter.simulateNetworkChange("PUBLIC", "TESTNET");
    assert.strictEqual(machine.getState().status, "wrong-network");
    
    adapter.simulateNetworkChange("TESTNET", "TESTNET");
    assert.strictEqual(machine.getState().status, "connected");
  });
});
