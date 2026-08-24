import { useCallback } from "react";

import { isOfficialChannel, resolveModelChannel, useConfigStore, type AiConfig } from "@/stores/use-config-store";
import { useOfficialAccountStore } from "@/stores/use-official-account-store";

export function useGenerationAccess() {
    const status = useOfficialAccountStore((state) => state.status);
    const setDrawerOpen = useOfficialAccountStore((state) => state.setDrawerOpen);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);

    return useCallback((config: AiConfig, model: string) => {
        if (!model.trim()) {
            openConfigDialog(true);
            return false;
        }
        const channel = resolveModelChannel(config, model);
        if (isOfficialChannel(channel)) {
            if (status.enabled && status.connected) return true;
            setDrawerOpen(true);
            return false;
        }
        if (model.trim() && channel.baseUrl.trim() && channel.apiKey.trim()) return true;
        openConfigDialog(true);
        return false;
    }, [openConfigDialog, setDrawerOpen, status.connected, status.enabled]);
}
