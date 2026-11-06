/**
 * `/name "Chicken Door Tamer"` used to store the quotes as part of the name,
 * so every footer, picker, and peer list showed them. Shell habit says quote a
 * name with spaces; the command takes the rest of the line verbatim, so one
 * matching outer pair is dropped. Inner quotes and lone quotes are kept.
 */

const PAIRS: Record<string, string> = { '"': '"', "'": "'", "`": "`", "\u201c": "\u201d", "\u2018": "\u2019" };

export function stripOuterQuotes(name: string): string {
	const trimmed = name.trim();
	if (trimmed.length < 2) return trimmed;
	const close = PAIRS[trimmed[0]!];
	if (!close || trimmed[trimmed.length - 1] !== close) return trimmed;
	return trimmed.slice(1, -1).trim();
}
