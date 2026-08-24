import { useEffect, useState } from "react";
import { App, Alert, Button, Drawer, Input, Popconfirm } from "antd";
import { ExternalLink, KeyRound, Link2, RefreshCw, Ticket, Unplug, Wallet } from "lucide-react";
import { useTranslation } from "react-i18next";

import { disconnectOfficialAccount, exchangeOfficialPairingCode, redeemOfficialCard } from "@/services/api/official-account";
import { formatOfficialPoints } from "@/lib/official-points";
import { useOfficialAccountStore } from "@/stores/use-official-account-store";

function isSafeUrl(value: string, allowLoopbackHttp = false) {
    try {
        const url = new URL(value);
        if (url.username || url.password || url.search || url.hash) return false;
        return url.protocol === "https:" || (allowLoopbackHttp && url.protocol === "http:" && ["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname));
    } catch {
        return false;
    }
}

export function OfficialAccountDrawer() {
    const { message } = App.useApp();
    const { i18n, t } = useTranslation();
    const open = useOfficialAccountStore((state) => state.isDrawerOpen);
    const setDrawerOpen = useOfficialAccountStore((state) => state.setDrawerOpen);
    const status = useOfficialAccountStore((state) => state.status);
    const balance = useOfficialAccountStore((state) => state.balance);
    const isLoading = useOfficialAccountStore((state) => state.isLoading);
    const isStale = useOfficialAccountStore((state) => state.isStale);
    const error = useOfficialAccountStore((state) => state.error);
    const lastRefreshedAt = useOfficialAccountStore((state) => state.lastRefreshedAt);
    const refresh = useOfficialAccountStore((state) => state.refresh);
    const [pairCode, setPairCode] = useState("");
    const [cardCode, setCardCode] = useState("");
    const [pairing, setPairing] = useState(false);
    const [redeeming, setRedeeming] = useState(false);
    const [disconnecting, setDisconnecting] = useState(false);
    const portalUrl = isSafeUrl(status.accountPortalUrl, true) ? status.accountPortalUrl : "";
    const canTopUp = isSafeUrl(balance?.topUpLink || "");
    const points = balance ? formatOfficialPoints(balance.points, i18n.resolvedLanguage || "en-US") : "—";
    const tokenExpired = Boolean(status.tokenExpiresAt) && Date.parse(status.tokenExpiresAt) <= Date.now();

    useEffect(() => {
        if (open) void refresh();
    }, [open, refresh]);

    const pair = async () => {
        if (!pairCode.trim()) {
            message.warning(t("officialAccount.pairCodeRequired"));
            return;
        }
        setPairing(true);
        try {
            await exchangeOfficialPairingCode(pairCode.trim());
            setPairCode("");
            await refresh();
            message.success(t("officialAccount.pairSuccess"));
        } catch {
            await refresh();
            message.error(t("officialAccount.pairFailed"));
        } finally {
            setPairing(false);
        }
    };

    const redeem = async () => {
        if (!cardCode.trim()) {
            message.warning(t("officialAccount.cardCodeRequired"));
            return;
        }
        setRedeeming(true);
        try {
            await redeemOfficialCard(cardCode.trim());
            setCardCode("");
            await refresh();
            message.success(t("officialAccount.redeemSuccess"));
        } catch {
            await refresh();
            message.error(t("officialAccount.redeemFailed"));
        } finally {
            setRedeeming(false);
        }
    };

    const disconnect = async () => {
        setDisconnecting(true);
        try {
            await disconnectOfficialAccount();
            await refresh();
            message.success(t("officialAccount.disconnectSuccess"));
        } catch {
            await refresh();
            message.error(t("officialAccount.disconnectFailed"));
        } finally {
            setDisconnecting(false);
        }
    };

    return (
        <Drawer title={t("officialAccount.title")} placement="right" width={420} open={open} onClose={() => setDrawerOpen(false)}>
            <div className="space-y-5">
                {!status.enabled ? <Alert type="info" showIcon message={t("officialAccount.unavailable")} description={t("officialAccount.unavailableDescription")} /> : null}
                {isLoading ? <Alert type="info" showIcon message={t("officialAccount.loading")} /> : null}
                {tokenExpired ? <Alert type="warning" showIcon message={t("officialAccount.tokenExpired")} /> : null}
                {error ? <Alert type={isStale ? "warning" : "error"} showIcon message={t(isStale ? "officialAccount.stale" : "officialAccount.requestFailed")} /> : null}
                {status.enabled && status.connected ? (
                    <section className="rounded-lg border border-stone-200 p-4 dark:border-stone-800">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 text-sm font-semibold"><Wallet className="size-4" />{t("officialAccount.connected")}</div>
                            <Button type="text" size="small" loading={isLoading} icon={<RefreshCw className="size-3.5" />} onClick={() => void refresh()}>{t("officialAccount.refresh")}</Button>
                        </div>
                        <div className="mt-4 text-3xl font-semibold tabular-nums">{points}<span className="ml-1 text-sm font-normal text-stone-500">{t("officialAccount.pointsUnit")}</span></div>
                        {lastRefreshedAt ? <div className="mt-2 text-xs text-stone-500">{t("officialAccount.lastUpdated", { time: new Date(lastRefreshedAt).toLocaleString(i18n.resolvedLanguage) })}</div> : null}
                    </section>
                ) : null}

                {status.enabled && !status.connected ? (
                    <section className="space-y-3 rounded-lg border border-stone-200 p-4 dark:border-stone-800">
                        <div className="flex items-center gap-2 text-sm font-semibold"><Link2 className="size-4" />{t("officialAccount.connectTitle")}</div>
                        <p className="text-sm leading-6 text-stone-500">{t("officialAccount.connectDescription")}</p>
                        {portalUrl ? <a href={portalUrl} target="_blank" rel="noopener noreferrer"><Button block icon={<ExternalLink className="size-4" />}>{t("officialAccount.openPortal")}</Button></a> : null}
                        <Input.Password value={pairCode} onChange={(event) => setPairCode(event.target.value)} placeholder={t("officialAccount.pairCodePlaceholder")} aria-label={t("officialAccount.pairCodePlaceholder")} autoComplete="off" />
                        <Button type="primary" block disabled={isLoading} loading={pairing} icon={<KeyRound className="size-4" />} onClick={() => void pair()}>{t("officialAccount.connect")}</Button>
                    </section>
                ) : null}

                {status.enabled && status.connected ? (
                    <>
                        <section className="space-y-3 rounded-lg border border-stone-200 p-4 dark:border-stone-800">
                            <div className="flex items-center gap-2 text-sm font-semibold"><Ticket className="size-4" />{t("officialAccount.redeemTitle")}</div>
                            <Input.Password value={cardCode} onChange={(event) => setCardCode(event.target.value)} placeholder={t("officialAccount.cardCodePlaceholder")} aria-label={t("officialAccount.cardCodePlaceholder")} autoComplete="off" />
                            <Button block disabled={isLoading} loading={redeeming} onClick={() => void redeem()}>{t("officialAccount.redeem")}</Button>
                        </section>
                        {canTopUp ? <a href={balance?.topUpLink} target="_blank" rel="noopener noreferrer"><Button block type="primary" icon={<ExternalLink className="size-4" />}>{t("officialAccount.buyCard")}</Button></a> : null}
                        <Popconfirm title={t("officialAccount.disconnectConfirm")} okButtonProps={{ danger: true, loading: disconnecting }} onConfirm={() => void disconnect()}>
                            <Button block danger icon={<Unplug className="size-4" />}>{t("officialAccount.disconnect")}</Button>
                        </Popconfirm>
                    </>
                ) : null}

                <p className="text-xs leading-5 text-stone-500">{t("officialAccount.privacy")}</p>
            </div>
        </Drawer>
    );
}
