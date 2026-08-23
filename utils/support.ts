/**
 * Whether this browser can run the piece at all.
 *
 * Everything checked here the piece calls unguarded, so a browser missing
 * any of it does not merely look worse — it throws before the visitor is
 * ever shown a frame:
 *
 *   - WebGL: the whole piece is one regl-drawn quad
 *   - AudioContext: the beat grid reads the audio clock, and there is no
 *     other timer to fall back on
 *   - Promise.withResolvers: awaited by the audio start handshake. The
 *     newest of the three (Chrome 119 / Safari 17.4 / Firefox 121), so it
 *     is what the line effectively sits at.
 *
 * WebCodecs is deliberately absent: useVideoTextureArray already falls back
 * to <video> + seek on its own, so its absence costs smoothness, not the
 * piece.
 */

let cached: boolean | null = null

export function isSupported(): boolean {
	if (cached === null) cached = detect()
	return cached
}

function detect(): boolean {
	// No DOM means the static build, not a visitor — leave the call to the
	// client, which runs this again the moment the app mounts.
	if (typeof window === 'undefined' || typeof document === 'undefined') {
		return true
	}

	try {
		if (typeof AudioContext === 'undefined') return false
		if (typeof Promise.withResolvers !== 'function') return false

		const gl = document.createElement('canvas').getContext('webgl')
		if (!gl) return false

		// Hand the context straight back: browsers cap how many live at once,
		// and regl is about to ask for one of its own.
		gl.getExtension('WEBGL_lose_context')?.loseContext()

		return true
	} catch {
		// A browser that throws on the checks themselves is precisely the
		// kind this is here to catch.
		return false
	}
}
