import type { StateStorage } from "zustand/middleware";

import { createPersistentStore } from "@/services/dsh-persistent-store";

const store = createPersistentStore({ name: "infinite-canvas", storeName: "app_state" });

export const localForageStorage: StateStorage = {
    getItem: async (name) => {
        if (typeof window === "undefined") return null;
        try {
            const value = await store.getItem<string>(name);
            if (value !== null) return value;
            const legacy = window.localStorage.getItem(name);
            if (legacy === null) return null;
            await store.setItem(name, legacy);
            window.localStorage.removeItem(name);
            return legacy;
        } catch {
            return window.localStorage.getItem(name);
        }
    },
    setItem: async (name, value) => {
        if (typeof window === "undefined") return;
        try {
            await store.setItem(name, value);
            window.localStorage.removeItem(name);
        } catch {
            window.localStorage.setItem(name, value);
        }
    },
    removeItem: async (name) => {
        if (typeof window === "undefined") return;
        try {
            await store.removeItem(name);
        } finally {
            window.localStorage.removeItem(name);
        }
    },
};
