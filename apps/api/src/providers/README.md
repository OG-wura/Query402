# Query402 Providers Architecture

This directory contains the adapters for external APIs (Search, News, Scrape) and the core execution registry. The registry ensures that all providers are bounded by timeouts, circuit breakers, and explicit fallback semantics to guarantee reliability.

## How to Add a New Provider

To add a new data provider to the Query402 network, follow these steps:

1. **Add Pricing Definition:**
   Open `apps/api/src/lib/pricing.ts` and add your provider configuration to the `providers` array. Ensure you provide a unique `id`, a descriptive `category` (search, news, or scrape), and an estimated `latencyEstimateMs`. Determine if it's a `live` provider or just a `deterministic-fallback` demo provider.

2. **Create the Adapter Class:**
   Create a new file (or append to the relevant category file like `search.ts`) exporting a class that implements `ProviderAdapter`.

   ```typescript
   export class MyCustomAdapter implements ProviderAdapter {
     constructor(public id: string) {}

     async isHealthy(): Promise<boolean> {
       return true; // Or add dynamic health checking logic
     }

     async execute(queryOrUrl: string): Promise<ProviderResultItem[]> {
       // Fetch your live data here
       // Throw an error if no items are found so the circuit breaker can catch it
     }

     getFallback(queryOrUrl: string): ProviderResultItem[] {
       // Optional: return mock deterministic data if the live execution fails
       return [];
     }
   }
   ```

3. **Register the Adapter:**
   Open `apps/api/src/providers/index.ts` and register your new instance with the `registry`:
   ```typescript
   registry.register(new MyCustomAdapter("my.custom.provider"));
   ```

That's it! The `ProviderRegistry` will automatically handle timing it out if it hangs, circuit-breaking it if it fails repeatedly, enforcing the category validation, and ensuring the metadata truthfully reports `live` or `deterministic-fallback` back to the client.
