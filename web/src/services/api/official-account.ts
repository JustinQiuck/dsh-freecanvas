import { OFFICIAL_API_BASE_URL } from "@/stores/use-config-store";

export type OfficialAccountStatus = {
    enabled: boolean;
    connected: boolean;
    accountPortalUrl: string;
    tokenExpiresAt: string;
};

export type OfficialAccountBalance = OfficialAccountStatus & {
    points: string;
    usedPoints: string;
    pointsScale: number;
    topUpLink: string;
};

export class OfficialAccountError extends Error {
    constructor(public readonly status: number, public readonly code: string) {
        super(code);
    }
}

async function officialRequest<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${OFFICIAL_API_BASE_URL}${path}`, {
        ...init,
        credentials: "omit",
        headers: { accept: "application/json", ...(init?.headers || {}) },
    });
    const data = (await response.json().catch(() => ({}))) as { error?: unknown } & T;
    if (!response.ok) throw new OfficialAccountError(response.status, typeof data.error === "string" ? data.error : "OFFICIAL_ACCOUNT_REQUEST_FAILED");
    return data;
}

function toStatus(data: Record<string, unknown>): OfficialAccountStatus {
    return {
        enabled: data.enabled === true,
        connected: data.connected === true,
        accountPortalUrl: typeof data.account_portal_url === "string" ? data.account_portal_url : "",
        tokenExpiresAt: typeof data.token_expires_at === "string" ? data.token_expires_at : "",
    };
}

export async function getOfficialAccountStatus() {
    return toStatus(await officialRequest<Record<string, unknown>>("/status"));
}

export async function getOfficialAccount() {
    const data = await officialRequest<Record<string, unknown>>("/account");
    return {
        ...toStatus(data),
        points: typeof data.points === "string" ? data.points : "",
        usedPoints: typeof data.used_points === "string" ? data.used_points : "",
        pointsScale: typeof data.points_scale === "number" ? data.points_scale : 1000,
        topUpLink: typeof data.topup_link === "string" ? data.topup_link : "",
    } satisfies OfficialAccountBalance;
}

export async function exchangeOfficialPairingCode(pairCode: string) {
    return toStatus(await officialRequest<Record<string, unknown>>("/pair/exchange", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pair_code: pairCode }),
    }));
}

export async function redeemOfficialCard(code: string) {
    return officialRequest<{ success: boolean; added_points?: string; points?: string }>("/redeem", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
    });
}

export async function disconnectOfficialAccount() {
    await officialRequest("/device", { method: "DELETE" });
}
