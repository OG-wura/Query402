import { ProviderAdapter, ProviderRegistry, AdapterExecutionResult } from "./core.js";
import { getProviderById } from "../lib/pricing.js";

interface CircuitBreakerConfig {
  maxFailures: number;
  cooldownMs: number;
  timeoutMs: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  maxFailures: 3,
  cooldownMs: 30000,
  timeoutMs: 5000
};

class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;

  constructor(private config: CircuitBreakerConfig = DEFAULT_CONFIG) {}

  isOpen(): boolean {
    if (this.failures >= this.config.maxFailures) {
      const now = Date.now();
      if (now - this.lastFailureTime > this.config.cooldownMs) {
        // Half-open: let one request through to test recovery
        this.failures = this.config.maxFailures - 1;
        return false;
      }
      return true;
    }
    return false;
  }

  recordSuccess() {
    this.failures = 0;
  }

  recordFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
  }

  async executeWithTimeout<T>(promise: Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("Timeout"));
      }, this.config.timeoutMs);

      promise
        .then((res) => {
          clearTimeout(timer);
          resolve(res);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }
}

export class DefaultProviderRegistry implements ProviderRegistry {
  private adapters = new Map<string, ProviderAdapter>();
  private circuits = new Map<string, CircuitBreaker>();

  register(adapter: ProviderAdapter): void {
    this.adapters.set(adapter.id, adapter);
    this.circuits.set(adapter.id, new CircuitBreaker());
  }

  async execute(
    mode: "search" | "news" | "scrape",
    providerId: string,
    queryOrUrl: string
  ): Promise<AdapterExecutionResult> {
    const providerDef = getProviderById(providerId);
    if (!providerDef) {
      throw new Error(`Provider not found or disabled: ${providerId}`);
    }

    if (providerDef.category !== mode) {
      throw new Error(`Provider ${providerId} does not support mode ${mode}`);
    }

    const adapter = this.adapters.get(providerId);
    if (!adapter) {
      throw new Error(`No adapter registered for provider: ${providerId}`);
    }

    const circuit = this.circuits.get(providerId)!;

    // If it's a strictly deterministic (mock) adapter
    if (providerDef.sourceType === "deterministic-fallback") {
      if (adapter.getFallback) {
        return {
          items: adapter.getFallback(queryOrUrl),
          source: "deterministic-fallback"
        };
      }
      // Fallback to executing it directly if no getFallback is provided
      try {
        const items = await adapter.execute(queryOrUrl);
        return { items, source: "deterministic-fallback" };
      } catch (err) {
        return { items: [], source: "unavailable" };
      }
    }

    // Real adapter logic
    if (circuit.isOpen() || !(await adapter.isHealthy().catch(() => false))) {
      return this.handleFallback(adapter, queryOrUrl);
    }

    try {
      const items = await circuit.executeWithTimeout(adapter.execute(queryOrUrl));
      circuit.recordSuccess();
      return {
        items,
        source: "live"
      };
    } catch (err) {
      circuit.recordFailure();
      return this.handleFallback(adapter, queryOrUrl);
    }
  }

  private handleFallback(adapter: ProviderAdapter, queryOrUrl: string): AdapterExecutionResult {
    if (adapter.getFallback) {
      return {
        items: adapter.getFallback(queryOrUrl),
        source: "deterministic-fallback"
      };
    }
    return {
      items: [],
      source: "unavailable"
    };
  }
}

export const registry = new DefaultProviderRegistry();
