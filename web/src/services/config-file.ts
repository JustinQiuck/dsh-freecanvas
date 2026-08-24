import { saveAs } from "file-saver";

import i18n from "@/i18n";
import { decodeChannelModel, isOfficialChannel, modelOptionsFromChannels, normalizeAiConfig, useConfigStore, type AiConfig, type WebdavSyncConfig } from "@/stores/use-config-store";
import { usePromptSourceStore, type PromptSourceSchedule } from "@/stores/use-prompt-source-store";
import type { PromptSource } from "@/services/api/prompt-source-presets";

type AppConfigFile = {
    app: "infinite-canvas";
    version: 1;
    exportedAt: string;
    config: AiConfig;
    webdav: WebdavSyncConfig;
    promptSources: {
        sources: PromptSource[];
        schedule: PromptSourceSchedule;
    };
};

export function exportAppConfig() {
    const { config, webdav } = useConfigStore.getState();
    const { sources, schedule } = usePromptSourceStore.getState();
    const customChannels = config.channels.filter((channel) => !isOfficialChannel(channel));
    const selectedCustomModel = (value: string) => {
        const channelId = decodeChannelModel(value)?.channelId;
        return customChannels.some((channel) => channel.id === channelId) ? value : "";
    };
    const exportConfig: AiConfig = {
        ...config,
        channels: customChannels,
        models: modelOptionsFromChannels(customChannels),
        model: selectedCustomModel(config.model),
        imageModel: selectedCustomModel(config.imageModel),
        videoModel: selectedCustomModel(config.videoModel),
        textModel: selectedCustomModel(config.textModel),
        audioModel: selectedCustomModel(config.audioModel),
    };
    const data: AppConfigFile = { app: "infinite-canvas", version: 1, exportedAt: new Date().toISOString(), config: exportConfig, webdav, promptSources: { sources, schedule } };
    saveAs(new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" }), "dsh-freecanvas-config.json");
}

export async function importAppConfig(file: File) {
    let data: AppConfigFile;
    try {
        data = JSON.parse(await file.text()) as AppConfigFile;
    } catch {
        throw new Error(i18n.t("config.invalidFile"));
    }
    if (data.app !== "infinite-canvas" || data.version !== 1 || !data.config || !data.webdav || !data.promptSources) throw new Error(i18n.t("config.invalidFile"));
    useConfigStore.setState({ config: normalizeAiConfig(data.config), webdav: data.webdav });
    usePromptSourceStore.setState(data.promptSources);
}
