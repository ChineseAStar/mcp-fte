/**
 * MCP File Transfer Extension — protocol constants and types.
 */

export const EXTENSION_ID = "cc.qqxing/file-transfer";

export const Methods = {
    READ_INIT: `${EXTENSION_ID}/read/init`,
    READ_CHUNK: `${EXTENSION_ID}/read/chunk`,
    READ_CLOSE: `${EXTENSION_ID}/read/close`,
    WRITE_INIT: `${EXTENSION_ID}/write/init`,
    WRITE_CHUNK: `${EXTENSION_ID}/write/chunk`,
    WRITE_CLOSE: `${EXTENSION_ID}/write/close`,
    ABORT: `${EXTENSION_ID}/abort`,

    isFteMethod(method: string): boolean {
        return method.startsWith(`${EXTENSION_ID}/`);
    },
} as const;

// ── Request / Response types ──

export interface ReadInitRequest {
    uri: string;
}
export interface ReadInitResponse {
    transfer_id: string;
    total_size: number;
    ttl: number;
}

export interface ReadChunkRequest {
    transfer_id: string;
    offset: number;
    length: number;
}
export interface ReadChunkResponse {
    data: string;
    eof: boolean;
}

export interface ReadCloseRequest {
    transfer_id: string;
}

export interface WriteInitRequest {
    uri: string;
    expected_size?: number;
    /** Allow overwriting an existing file. Default false. */
    force?: boolean;
}
export interface WriteInitResponse {
    transfer_id: string;
    ttl: number;
}

export interface WriteChunkRequest {
    transfer_id: string;
    offset: number;
    data: string;
}
export interface WriteChunkResponse {
    bytes_written: number;
}

export interface WriteCloseRequest {
    transfer_id: string;
    hash_algorithm?: string;
    expected_hash?: string;
}
export interface WriteCloseResponse {
    verified?: boolean;
}

export interface AbortRequest {
    transfer_id: string;
}

// ── Error codes ──

export const FteErrorCodes = {
    TRANSFER_NOT_FOUND: -32000,
    URI_NOT_ALLOWED: -32001,
    INVALID_OFFSET: -32002,
    SESSION_EXPIRED: -32003,
    HASH_MISMATCH: -32004,
    FILE_NOT_FOUND: -32005,
    PERMISSION_DENIED: -32006,
    WRITE_CONFLICT: -32007,
} as const;

// ── Orchestrator types ──

export interface TransferArgs {
    source_server_id: string;
    source_uri: string;
    target_server_id: string;
    target_uri: string;
    /** Allow overwriting if target already exists. Default false. */
    force?: boolean;
}

export interface TransferResult {
    success: boolean;
    message: string;
    elapsed_ms?: number;
    bytes_transferred?: number;
}

/**
 * Capability declaration found in server's capabilities.experimental.
 */
export interface FteCapabilities {
    supported_schemes: string[];
    max_chunk_size?: number;
}
