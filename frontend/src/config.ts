const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();

export const API_BASE_URL = configuredApiBaseUrl ? configuredApiBaseUrl.replace(/\/+$/, "") : "";

export const AUTH_MOCK_ENABLED = import.meta.env.VITE_AUTH_MOCK === "true";
