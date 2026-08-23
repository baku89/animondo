import Regl from 'regl'

import DefaultVertexShader from '~/components/shaders/default.vert?raw'
import {useVideoTextureArray} from '~/composables/useVideoTextureArray'
import type {MainToWorker, WorkerToMain} from '~/workers/tileRenderer.worker'

/** What the page sends down for every drawn frame */
export interface FrameProps {
	navMatrix: readonly number[]
	focusCell: [number, number]
	focusFade: number
	/** gl_FragCoord -> crayon-veil UV (keeps the grain at CSS-pixel scale) */
	fadeMaskScale: [number, number]
	/** This 12 fps tick's roll of the veil, in mask UV */
	fadeMaskOffset: [number, number]
	/** Canvas backing-store size (CSS pixels x devicePixelRatio) */
	width: number
	height: number
}

export interface TileRendererOptions {
	frag: string
	sources: string[]
	tileMapWidth: number
	tileMapHeight: number
	/** The renderer died after setup (a worker crash, a lost context) */
	onError: (error: unknown) => void
}

/**
 * The rendering machine behind the piece, in whichever thread suits the
 * browser. Both backends speak the same contract:
 *
 *   present(frame, pixels?)  show a sprite frame — and when the automaton
 *                            stepped, its new tile map in the same breath
 *   prepare(frame)           start decoding toward the next frame
 *   setTileMapPixels(px)     pattern changed with no sprite frame to wait for
 *   render(props)            draw with these uniforms, now
 *
 * The worker backend is preferred: it keeps Safari's expensive
 * VideoFrame-to-texture conversion (and all decoding) off the main thread,
 * so the UI never stutters on the beat. Browsers that cannot run it fall
 * back to the main-thread backend, which is the pre-worker renderer intact.
 */
export interface TileRenderer {
	present: (frame: number, pixels?: Uint8Array) => Promise<void>
	prepare: (frame: number) => void
	setTileMapPixels: (pixels: Uint8Array) => void
	render: (props: FrameProps) => void
	dispose: () => void
}

export async function createTileRenderer(
	canvas: HTMLCanvasElement,
	options: TileRendererOptions
): Promise<TileRenderer> {
	if (
		typeof Worker !== 'undefined' &&
		typeof OffscreenCanvas !== 'undefined' &&
		typeof canvas.transferControlToOffscreen === 'function'
	) {
		try {
			return await createWorkerBackend(canvas, options)
		} catch (error) {
			console.warn('worker renderer unavailable, rendering on main', error)
		}
	}
	return createMainBackend(canvas, options)
}

// --- Worker backend ---

async function createWorkerBackend(
	canvas: HTMLCanvasElement,
	options: TileRendererOptions
): Promise<TileRenderer> {
	const worker = new Worker(
		new URL('../workers/tileRenderer.worker.ts', import.meta.url),
		{type: 'module'}
	)

	const post = (message: MainToWorker) => worker.postMessage(message)

	/** One-shot wait for the worker's next reply of the given kinds */
	function nextReply(
		accept: WorkerToMain['type'][]
	): Promise<WorkerToMain> {
		return new Promise((resolve, reject) => {
			const onMessage = (event: MessageEvent<WorkerToMain>) => {
				if (!accept.includes(event.data.type)) return
				cleanup()
				resolve(event.data)
			}
			const onFail = (event: ErrorEvent) => {
				cleanup()
				reject(new Error(event.message || 'worker failed to start'))
			}
			const cleanup = () => {
				worker.removeEventListener('message', onMessage)
				worker.removeEventListener('error', onFail)
			}
			worker.addEventListener('message', onMessage)
			worker.addEventListener('error', onFail)
		})
	}

	// Phase 1 commits nothing: the worker checks its own WebGL and decodes,
	// and an 'unsupported' here still leaves the canvas free for the
	// main-thread backend.
	const loadReply = nextReply(['loaded', 'unsupported'])
	post({type: 'load', sources: options.sources})
	const loaded = await loadReply
	if (loaded.type === 'unsupported') {
		worker.terminate()
		throw new Error(loaded.reason)
	}

	// Phase 2 hands the canvas over — no way back from here, so a failure
	// (a shader the driver refuses) is fatal, exactly as it was on main.
	const readyReply = nextReply(['ready', 'error'])
	const offscreen = canvas.transferControlToOffscreen()
	worker.postMessage(
		{
			type: 'start',
			canvas: offscreen,
			frag: options.frag,
			vert: DefaultVertexShader,
			tileMapWidth: options.tileMapWidth,
			tileMapHeight: options.tileMapHeight,
		} satisfies MainToWorker,
		[offscreen]
	)
	const ready = await readyReply
	if (ready.type === 'error') {
		worker.terminate()
		throw Object.assign(new Error(ready.message), {fatal: true})
	}

	// Anything after this point is a crash mid-piece
	worker.addEventListener('message', (event: MessageEvent<WorkerToMain>) => {
		if (event.data.type === 'error') options.onError(new Error(event.data.message))
	})
	worker.addEventListener('error', event =>
		options.onError(new Error(event.message || 'worker crashed'))
	)

	return {
		// Message order is preserved, but a present is served asynchronously
		// on the far side while a draw is served at once — the worker holds
		// its draws until the swap so the two cannot be paired wrongly.
		present: (frame, pixels) => {
			post({type: 'present', frame, pixels})
			return Promise.resolve()
		},
		prepare: frame => post({type: 'prepare', frame}),
		setTileMapPixels: pixels => post({type: 'tilemap', pixels}),
		render: props =>
			post({
				type: 'frame',
				nav: [...props.navMatrix],
				focusCell: props.focusCell,
				focusFade: props.focusFade,
				fadeMaskScale: props.fadeMaskScale,
				fadeMaskOffset: props.fadeMaskOffset,
				width: props.width,
				height: props.height,
			}),
		dispose: () => worker.terminate(),
	}
}

// --- Main-thread backend ---

async function createMainBackend(
	canvas: HTMLCanvasElement,
	options: TileRendererOptions
): Promise<TileRenderer> {
	const regl = Regl({
		canvas,
		attributes: {
			// The scene is one full-screen quad: there is no geometry edge
			// for MSAA to smooth, so antialiasing only buys a 4x resolve
			// of a retina-sized canvas every frame — which Safari's Metal
			// backend pays for dearly during pan and zoom.
			antialias: false,
			premultipliedAlpha: true,
			powerPreference: 'high-performance',
		},
	})

	const videoTextures = useVideoTextureArray(regl, options.sources)
	await videoTextures.load()

	const tileMapTexture = regl.texture({
		width: options.tileMapWidth,
		height: options.tileMapHeight,
		format: 'rgb',
		type: 'uint8',
		mag: 'nearest',
		min: 'nearest',
		wrap: 'repeat',
	})

	// The crayon veil (see tile.frag). Until the image lands the 1x1 opaque
	// white placeholder reproduces the old flat fade, so a slow fetch only
	// delays the grain, never the piece.
	const fadeMaskTexture = regl.texture({
		width: 1,
		height: 1,
		data: new Uint8Array([255, 255, 255, 255]),
		wrap: 'repeat',
		mag: 'linear',
		min: 'linear',
	})
	const fadeMaskImage = new Image()
	fadeMaskImage.onload = () =>
		fadeMaskTexture({
			data: fadeMaskImage,
			wrap: 'repeat',
			mag: 'linear',
			min: 'linear',
		})
	fadeMaskImage.src = '/animondo/fade-mask.webp'

	const draw = regl({
		frag: options.frag,
		vert: DefaultVertexShader,
		attributes: {
			position: [-1, -1, 1, -1, -1, 1, 1, 1],
		},
		depth: {
			enable: false,
		},
		count: 4,
		primitive: 'triangle strip',
		uniforms: {
			resolution(context: Regl.DefaultContext) {
				return [context.viewportWidth, context.viewportHeight]
			},
			video0: regl.prop<Record<string, unknown>, string>('video0'),
			video1: regl.prop<Record<string, unknown>, string>('video1'),
			video2: regl.prop<Record<string, unknown>, string>('video2'),
			video3: regl.prop<Record<string, unknown>, string>('video3'),
			video4: regl.prop<Record<string, unknown>, string>('video4'),
			video5: regl.prop<Record<string, unknown>, string>('video5'),
			video6: regl.prop<Record<string, unknown>, string>('video6'),
			video7: regl.prop<Record<string, unknown>, string>('video7'),
			tileMap: tileMapTexture,
			tileMapSize: [options.tileMapWidth, options.tileMapHeight],
			navMatrix: regl.prop<Record<string, unknown>, string>('navMatrix'),
			focusCell: regl.prop<Record<string, unknown>, string>('focusCell'),
			focusFade: regl.prop<Record<string, unknown>, string>('focusFade'),
			fadeMask: fadeMaskTexture,
			fadeMaskScale: regl.prop<Record<string, unknown>, string>('fadeMaskScale'),
			fadeMaskOffset: regl.prop<Record<string, unknown>, string>('fadeMaskOffset'),
		},
	})

	// The camera moves in the same tick the present is issued, but the frame
	// it belongs to only reaches the textures a decode later. Drawing in
	// between paints the new camera over the old turn — the dancer pops a
	// cell and snaps back — so the draw waits for the swap it belongs to.
	let presenting: Promise<void> | null = null
	let heldProps: FrameProps | null = null

	return {
		present: (frame, pixels) => {
			const swap = videoTextures.present(frame).then(() => {
				// In the same task as the uploads, so sprite frame and
				// pattern change together — nothing of the old turn flashes
				if (pixels) tileMapTexture.subimage(pixels)
			})
			presenting = swap
			swap.catch(() => {}).then(() => {
				// A newer present already has the floor
				if (presenting !== swap) return
				presenting = null
				const held = heldProps
				heldProps = null
				if (held) drawNow(held)
			})
			return swap
		},
		prepare: frame => videoTextures.prepare(frame),
		setTileMapPixels: pixels => tileMapTexture.subimage(pixels),
		render: props => {
			// Only the newest camera is worth drawing when the swap lands
			if (presenting) {
				heldProps = props
				return
			}
			drawNow(props)
		},
		dispose: () => regl.destroy(),
	}

	function drawNow(props: FrameProps) {
		if (canvas.width !== props.width || canvas.height !== props.height) {
			canvas.width = props.width
			canvas.height = props.height
		}

		const textures = videoTextures.textureArray.value
		if (textures.length < 8) return

		regl.poll()
		regl.clear({color: [0, 0, 0, 0]})
		draw({
			video0: textures[0],
			video1: textures[1],
			video2: textures[2],
			video3: textures[3],
			video4: textures[4],
			video5: textures[5],
			video6: textures[6],
			video7: textures[7],
			navMatrix: props.navMatrix,
			focusCell: props.focusCell,
			focusFade: props.focusFade,
			fadeMaskScale: props.fadeMaskScale,
			fadeMaskOffset: props.fadeMaskOffset,
		})
	}
}
