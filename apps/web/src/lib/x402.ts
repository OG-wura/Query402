import { x402Client } from "@x402/core/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { signAuthEntry, signTransaction } from "@stellar/freighter-api";
import type { ClientStellarSigner } from "@x402/stellar";
import { ExactStellarScheme } from "@x402/stellar/exact/client";
import type { PaidQueryResponse } from "../types.js";

const stellarRpcUrl = import.meta.env.VITE_STELLAR_RPC_URL ?? "https://soroban-testnet.stellar.org";

function createMachineSigner(wallet: import("./wallet/index.js").WalletSessionMachine): ClientStellarSigner {
  return {
    address: wallet.getState().address!,
    signAuthEntry: async (authEntryXdr, opts) => {
      const res = await wallet.signAuthEntry(authEntryXdr, opts);
      return res;
    },
    signTransaction: async (transactionXdr, opts) => {
      const res = await wallet.signTransaction(transactionXdr, opts);
      return res;
    }
  };
}

export async function runWalletPaidQuery(input: {
  apiBaseUrl: string;
  mode: "search" | "news" | "scrape";
  provider: string;
  query?: string;
  url?: string;
  wallet: import("./wallet/index.js").WalletSessionMachine;
}): Promise<PaidQueryResponse> {
  const params = new URLSearchParams({ provider: input.provider });

  if (input.mode === "scrape") {
    if (!input.url) {
      throw new Error("url is required for scrape mode");
    }
    params.set("url", input.url);
  } else {
    if (!input.query) {
      throw new Error("query is required for search/news mode");
    }
    params.set("q", input.query);
  }

  const endpoint = `${input.apiBaseUrl}/x402/${input.mode}?${params.toString()}`;

  const signer = createMachineSigner(input.wallet);
  const client = new x402Client().register("stellar:*", new ExactStellarScheme(signer, { url: stellarRpcUrl }));
  const fetchWithPayment = wrapFetchWithPayment(fetch, client);

  const response = await fetchWithPayment(endpoint, { method: "GET" });
  const payload = await response.json();

  if (!response.ok) {
    if (typeof payload?.error === "string" && payload.error.length > 0) {
      throw new Error(payload.error);
    }
    throw new Error(JSON.stringify(payload));
  }

  return payload as PaidQueryResponse;
}