export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// FastAPI errors come back as {"detail": string} or, for validation errors, {"detail": [{msg, ...}]}
export async function readApiError(response: Response, fallback: string): Promise<string> {
    const text = await response.text();
    try {
        const body = JSON.parse(text);
        if (typeof body.detail === 'string') return body.detail;
        if (Array.isArray(body.detail)) {
            return body.detail.map((d: { msg?: string }) => d.msg ?? JSON.stringify(d)).join('\n');
        }
    } catch {
        // Not JSON; fall through to raw text
    }
    return text || fallback;
}

export function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
