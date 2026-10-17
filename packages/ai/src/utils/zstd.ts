import type * as NodeZlib from "node:zlib";

// Level 3 matches the official Codex client and keeps compression cheap
// relative to request latency.
const REQUEST_COMPRESSION_ZSTD_LEVEL = 3;

type ProcessWithBuiltinModule = typeof process & {
	getBuiltinModule?: (id: "node:zlib") => typeof NodeZlib;
};

function loadNodeZlib(): typeof NodeZlib | null {
	if (typeof process === "undefined" || !(process.versions?.node || process.versions?.bun)) {
		return null;
	}
	return (process as ProcessWithBuiltinModule).getBuiltinModule?.("node:zlib") ?? null;
}

/**
 * Returns the zstd-compressed request body bytes, or null when compression is
 * unavailable (browser/Vite builds, runtimes without zstd). Callers fall back to
 * sending the uncompressed body when this returns null.
 */
export function compressRequestBodyZstd(body: string): Uint8Array<ArrayBuffer> | null {
	const zlib = loadNodeZlib();
	if (!zlib || typeof zlib.zstdCompressSync !== "function") {
		return null;
	}
	try {
		const compressed = zlib.zstdCompressSync(body, {
			params: { [zlib.constants.ZSTD_c_compressionLevel]: REQUEST_COMPRESSION_ZSTD_LEVEL },
		});
		// A copy owns a plain ArrayBuffer, which fetch accepts as a body under every lib.
		return new Uint8Array(compressed);
	} catch {
		return null;
	}
}
