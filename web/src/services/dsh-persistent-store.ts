import localforage from "localforage";

const STORAGE_PATH = "/dsh-freecanvas-storage";
const STORAGE_HEADER = "x-dsh-freecanvas-storage";
const INITIALIZED_HEADER = "x-dsh-freecanvas-store-initialized";
const VALUE_TYPE_HEADER = "x-dsh-freecanvas-value-type";

type HostResult<T> = { available: boolean; initialized: boolean; value: T | null };
type HostListResult = { available: boolean; initialized: boolean; keys: string[] };
type LocalForageInstance = ReturnType<typeof localforage.createInstance>;
type StoreOptions = Parameters<typeof localforage.createInstance>[0];

export type PersistentStore = {
    getItem<T>(key: string): Promise<T | null>;
    setItem<T>(key: string, value: T): Promise<T>;
    removeItem(key: string): Promise<void>;
    clear(): Promise<void>;
    iterate<T, U>(callback: (value: T, key: string, iterationNumber: number) => U | void): Promise<U | void>;
};

function usesDshHostStorage() {
    return typeof window !== "undefined" && (window.location.pathname === "/dsh-freecanvas" || window.location.pathname.startsWith("/dsh-freecanvas/"));
}

function storeId(options: StoreOptions) {
    return `${options.name || "infinite-canvas"}:${options.storeName || "keyvaluepairs"}`;
}

function storeUrl(store: string, key?: string) {
    const base = `${STORAGE_PATH}/${encodeURIComponent(store)}`;
    return key === undefined ? base : `${base}/${encodeURIComponent(key)}`;
}

function isStorageResponse(response: Response) {
    return response.headers.get(STORAGE_HEADER) === "1";
}

function initialized(response: Response) {
    return response.headers.get(INITIALIZED_HEADER) === "1";
}

async function hostGet<T>(store: string, key: string): Promise<HostResult<T>> {
    if (!usesDshHostStorage()) return { available: false, initialized: false, value: null };
    try {
        const response = await fetch(storeUrl(store, key), { cache: "no-store" });
        if (!isStorageResponse(response)) return { available: false, initialized: false, value: null };
        if (response.status === 404) return { available: true, initialized: initialized(response), value: null };
        if (!response.ok) throw new Error(`DSH storage read failed: ${response.status}`);
        const kind = response.headers.get(VALUE_TYPE_HEADER);
        if (kind === "blob") return { available: true, initialized: true, value: (await response.blob()) as T };
        if (kind === "json") return { available: true, initialized: true, value: (await response.json()) as T };
        throw new Error("DSH storage returned an unknown value type");
    } catch (error) {
        console.warn("[dsh-freecanvas] host storage read failed", error);
        return { available: false, initialized: false, value: null };
    }
}

async function hostSet<T>(store: string, key: string, value: T) {
    if (!usesDshHostStorage()) return false;
    const blob = value instanceof Blob;
    const response = await fetch(storeUrl(store, key), {
        method: "PUT",
        headers: {
            "content-type": blob ? value.type || "application/octet-stream" : "application/json",
            [VALUE_TYPE_HEADER]: blob ? "blob" : "json",
        },
        body: blob ? value : JSON.stringify(value),
    });
    if (!isStorageResponse(response)) return false;
    if (!response.ok) throw new Error(`DSH storage write failed: ${response.status}`);
    return true;
}

async function hostRemove(store: string, key?: string) {
    if (!usesDshHostStorage()) return false;
    const response = await fetch(storeUrl(store, key), { method: "DELETE" });
    if (!isStorageResponse(response)) return false;
    if (!response.ok) throw new Error(`DSH storage delete failed: ${response.status}`);
    return true;
}

async function hostList(store: string): Promise<HostListResult> {
    if (!usesDshHostStorage()) return { available: false, initialized: false, keys: [] };
    try {
        const response = await fetch(storeUrl(store), { cache: "no-store" });
        if (!isStorageResponse(response)) return { available: false, initialized: false, keys: [] };
        if (!response.ok) throw new Error(`DSH storage list failed: ${response.status}`);
        const value = (await response.json()) as { initialized?: boolean; keys?: unknown };
        return { available: true, initialized: value.initialized === true, keys: Array.isArray(value.keys) ? value.keys.filter((key): key is string => typeof key === "string") : [] };
    } catch (error) {
        console.warn("[dsh-freecanvas] host storage list failed", error);
        return { available: false, initialized: false, keys: [] };
    }
}

async function localEntries(store: LocalForageInstance) {
    const entries: Array<[string, unknown]> = [];
    await store.iterate((value: unknown, key: string) => {
        entries.push([key, value]);
    });
    return entries;
}

export function createPersistentStore(options: StoreOptions): PersistentStore {
    const local = localforage.createInstance(options);
    const id = storeId(options);

    return {
        async getItem<T>(key: string) {
            const host = await hostGet<T>(id, key);
            if (host.available && host.initialized) {
                if (host.value === null) await local.removeItem(key);
                else await local.setItem(key, host.value);
                return host.value;
            }
            const value = await local.getItem<T>(key);
            if (host.available && value !== null) await hostSet(id, key, value);
            return value;
        },
        async setItem<T>(key: string, value: T) {
            const saved = await hostSet(id, key, value);
            await local.setItem(key, value);
            if (!saved && usesDshHostStorage()) console.warn("[dsh-freecanvas] host storage unavailable; saved only for the current browser origin");
            return value;
        },
        async removeItem(key: string) {
            await hostRemove(id, key);
            await local.removeItem(key);
        },
        async clear() {
            await hostRemove(id);
            await local.clear();
        },
        async iterate<T, U>(callback: (value: T, key: string, iterationNumber: number) => U | void) {
            const host = await hostList(id);
            let entries: Array<[string, unknown]>;
            if (host.available && host.initialized) {
                entries = [];
                for (const key of host.keys) {
                    const item = await hostGet<T>(id, key);
                    if (item.value !== null) entries.push([key, item.value]);
                }
            } else {
                entries = await localEntries(local);
                if (host.available) for (const [key, value] of entries) await hostSet(id, key, value);
            }
            let index = 1;
            for (const [key, value] of entries) {
                const result = callback(value as T, key, index++);
                if (result !== undefined) return result;
            }
        },
    };
}
