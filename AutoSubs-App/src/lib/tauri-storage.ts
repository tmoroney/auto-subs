import { load, Store } from "@tauri-apps/plugin-store";
import type { PersistStorage, StorageValue } from "zustand/middleware";

/**
 * Cache of loaded Tauri `Store` instances, keyed by file path.
 *
 * The Tauri plugin-store backend keys stores by path, so multiple `load()`
 * calls with the same path share the same underlying Rust store. We cache the
 * JS wrapper to avoid creating redundant resource-table entries.
 */
const storeCache = new Map<string, Store>();

async function getStore(path: string): Promise<Store> {
  let store = storeCache.get(path);
  if (!store) {
    store = await load(path, { autoSave: false });
    storeCache.set(path, store);
  }
  return store;
}

/**
 * Check whether a key exists in the Tauri store file. Used during manual
 * rehydration to detect first-run (no persisted data) vs. returning users.
 */
export async function hasStoredValue(path: string, key: string): Promise<boolean> {
  const store = await getStore(path);
  return store.has(key);
}

/**
 * Create a zustand `PersistStorage` backed by the official Tauri plugin-store.
 *
 * Unlike `createJSONStorage` (which stores a JSON string), this adapter stores
 * the raw state object directly under `key` in the Tauri store file —
 * preserving the existing on-disk format so current users' settings files
 * continue to work without migration.
 *
 * The `StorageValue` wrapper (`{ state, version }`) that zustand's persist
 * middleware uses internally is unwrapped: only `value.state` is written to
 * disk, and on read the persisted object is re-wrapped as
 * `{ state: <obj>, version: 0 }`.
 *
 * @param path - Tauri store file name (e.g. `"autosubs-store.json"`)
 * @param key - Key under which the state is stored within the file
 */
export function createTauriStorage<T>(
  path: string,
  key: string,
): PersistStorage<T> {
  return {
    getItem: async () => {
      const store = await getStore(path);
      const value = await store.get<T>(key);
      if (value == null) return null;
      return { state: value, version: 0 } as StorageValue<T>;
    },
    setItem: async (_name, value) => {
      const store = await getStore(path);
      // Unwrap StorageValue — store only the state to preserve file format.
      await store.set(key, value.state);
      await store.save();
    },
    removeItem: async () => {
      const store = await getStore(path);
      await store.delete(key);
      await store.save();
    },
  };
}
