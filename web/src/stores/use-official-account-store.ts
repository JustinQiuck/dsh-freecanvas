import { create } from "zustand";

import { getOfficialAccount, getOfficialAccountStatus, type OfficialAccountBalance, type OfficialAccountStatus } from "@/services/api/official-account";

type OfficialAccountStore = {
    status: OfficialAccountStatus;
    balance: OfficialAccountBalance | null;
    isLoading: boolean;
    isStale: boolean;
    error: string;
    lastRefreshedAt: string;
    isDrawerOpen: boolean;
    refresh: () => Promise<void>;
    setDrawerOpen: (open: boolean) => void;
};

const disconnectedStatus: OfficialAccountStatus = {
    enabled: false,
    connected: false,
    accountPortalUrl: "",
    tokenExpiresAt: "",
};

let refreshPromise: Promise<void> | undefined;

export const useOfficialAccountStore = create<OfficialAccountStore>((set, get) => ({
    status: disconnectedStatus,
    balance: null,
    isLoading: false,
    isStale: false,
    error: "",
    lastRefreshedAt: "",
    isDrawerOpen: false,
    refresh: async () => {
        if (refreshPromise) return refreshPromise;
        set({ isLoading: true, error: "" });
        refreshPromise = getOfficialAccountStatus()
            .then(async (status) => {
                if (!status.enabled || !status.connected) {
                    set({ status, balance: null, isLoading: false, isStale: false, error: "", lastRefreshedAt: new Date().toISOString() });
                    return;
                }
                const account = await getOfficialAccount();
                set({
                    status: { ...status, connected: account.connected },
                    balance: { ...account, ...status, connected: account.connected },
                    isLoading: false,
                    isStale: false,
                    error: "",
                    lastRefreshedAt: new Date().toISOString(),
                });
            })
            .catch((error: unknown) => {
                set({ isLoading: false, isStale: Boolean(get().lastRefreshedAt), error: error instanceof Error ? error.message : "OFFICIAL_ACCOUNT_REQUEST_FAILED" });
            })
            .finally(() => {
                refreshPromise = undefined;
            });
        return refreshPromise;
    },
    setDrawerOpen: (isDrawerOpen) => set({ isDrawerOpen }),
}));
