import type { CaptionPreset } from "../types.ts";

// Sentinel Security: Guard against prototype pollution and validate imported preset data.
export function isDangerousProperty(key: string): boolean {
    return key === "__proto__" || key === "constructor" || key === "prototype";
}

export function sanitizeObjectKeys(obj: unknown, depth = 0): unknown {
    if (!obj || typeof obj !== "object" || depth > 20) return obj;
    if (Array.isArray(obj)) return obj.map((item) => sanitizeObjectKeys(item, depth + 1));
    const clean: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
        if (!isDangerousProperty(key)) {
            clean[key] = sanitizeObjectKeys(value, depth + 1);
        }
    }
    return clean;
}

function genId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `preset-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso(): string {
    return new Date().toISOString();
}

/**
 * Runtime validation for imported JSON blobs. Ensures safe lengths, no control chars,
 * and protects against prototype pollution attacks.
 */
export function parseImportedPreset(json: string): CaptionPreset {
    let raw: any;
    try {
        raw = JSON.parse(json);
    } catch {
        throw new Error("Not valid JSON.");
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Expected a JSON object.");
    if (typeof raw.name !== "string" || raw.name.trim() === "") {
        throw new Error("Preset is missing a name.");
    }
    const trimmedName = raw.name.trim();
    if (trimmedName.length > 100 || /[\x00-\x1f\x7f]/.test(trimmedName)) {
        throw new Error("Preset name contains invalid characters or exceeds 100 characters.");
    }
    if (typeof raw.version !== "number" || !Number.isInteger(raw.version) || raw.version <= 0) {
        throw new Error("Preset has an invalid version.");
    }
    if (raw.macroSettings == null || typeof raw.macroSettings !== "object" || Array.isArray(raw.macroSettings)) {
        throw new Error("Preset is missing macroSettings.");
    }
    let sanitizedDescription: string | undefined;
    if (raw.description !== undefined) {
        if (typeof raw.description !== "string" || raw.description.length > 500 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(raw.description)) {
            throw new Error("Preset description is invalid or exceeds 500 characters.");
        }
        sanitizedDescription = raw.description.trim() || undefined;
    }
    const cleanSettings = sanitizeObjectKeys(raw.macroSettings) as Record<string, unknown>;
    const now = nowIso();
    return {
        id: genId(),
        name: trimmedName,
        description: sanitizedDescription,
        builtIn: false,
        version: raw.version,
        createdAt: now,
        updatedAt: now,
        macroSettings: cleanSettings,
    };
}
