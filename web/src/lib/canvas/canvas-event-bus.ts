import { createPersistentStore, type PersistentStore } from "@/services/dsh-persistent-store";
import type { PluginStorage } from "@/types/canvas-plugin";

// Lightweight canvas event bus for communication between nodes and plugins.
type Handler = (payload: unknown) => void;
const handlers = new Map<string, Set<Handler>>();

export function emitCanvasEvent(event: string, payload?: unknown) {
    handlers.get(event)?.forEach((handler) => {
        try {
            handler(payload);
        } catch (error) {
            console.error(`[canvas-event] handler for "${event}" failed`, error);
        }
    });
}

export function onCanvasEvent(event: string, handler: Handler) {
    let set = handlers.get(event);
    if (!set) {
        set = new Set();
        handlers.set(event, set);
    }
    set.add(handler);
    return () => set!.delete(handler);
}

// Private plugin storage isolated by pluginId namespace.
const stores = new Map<string, PersistentStore>();

export function createPluginStorage(pluginId: string): PluginStorage {
    let store = stores.get(pluginId);
    if (!store) {
        store = createPersistentStore({ name: "infinite-canvas-plugins", storeName: pluginId });
        stores.set(pluginId, store);
    }
    return {
        get: <T = unknown>(key: string) => store!.getItem<T>(key),
        set: async (key, value) => {
            await store!.setItem(key, value);
        },
        remove: async (key) => {
            await store!.removeItem(key);
        },
    };
}
