import Regl from 'regl'

import type {SpriteDecoder} from '../utils/spriteDecoder'
import {createSpriteDecoder, decodeFrame} from '../utils/spriteDecoder'

/**
 * The whole rendering side of the piece, off the main thread.
 *
 * Safari converts a VideoFrame to RGBA on the CPU inside texSubImage2D —
 * measured ~6ms per sprite, and eight sprites land on every beat frame. On
 * the main thread that was a ~45ms stall nine times a second, freezing every
 * button and bubble mid-stroke. Here the same work happens where nobody is
 * watching, and twice removed from the beat itself:
 *
 *   - Each sprite owns two textures. prepare() decodes the coming frame and
 *     uploads it to the BACK texture during the eight-frame gap, one sprite
 *     at a time (a macrotask between uploads lets draws slip through), so no
 *     single worker task grows past one upload.
 *   - present() then only swaps front and back — and applies the new tile
 *     map in the same task, so sprites and pattern change atomically.
 *
 * The protocol with the main thread is two-phase so an unsupported browser
 * can still fall back to the main-thread renderer: 'load' commits nothing
 * the page cannot take back, and only after 'loaded' does the main thread
 * hand over the canvas ('start'), past which failures are fatal (reported
 * as 'error', the same fate as a shader the driver refuses).
 */

interface WorkerSprite extends SpriteDecoder {
	front: Regl.Texture2D
	back: Regl.Texture2D
	/** Frame the back texture holds, -1 when stale */
	backFrame: number
}

export type MainToWorker =
	| {type: 'load'; sources: string[]}
	| {
			type: 'start'
			canvas: OffscreenCanvas
			frag: string
			vert: string
			tileMapWidth: number
			tileMapHeight: number
	  }
	| {type: 'tilemap'; pixels: Uint8Array}
	| {type: 'present'; frame: number; pixels?: Uint8Array}
	| {type: 'prepare'; frame: number}
	| {
			type: 'frame'
			nav: number[]
			focusCell: [number, number]
			focusFade: number
			fadeMaskScale: [number, number]
			fadeMaskOffset: [number, number]
			width: number
			height: number
	  }

export type WorkerToMain =
	| {type: 'loaded'}
	| {type: 'unsupported'; reason: string}
	| {type: 'ready'}
	| {type: 'error'; message: string}

const ctx = globalThis as unknown as {
	postMessage: (message: WorkerToMain) => void
	addEventListener: (
		type: 'message',
		listener: (event: MessageEvent<MainToWorker>) => void
	) => void
}

let regl: Regl.Regl | null = null
let gl: WebGLRenderingContext | null = null
let canvas: OffscreenCanvas | null = null
let drawCommand: Regl.DrawCommand | null = null
let tileMapTexture: Regl.Texture2D | null = null
let fadeMaskTexture: Regl.Texture2D | null = null
let sprites: WorkerSprite[] = []

// Scratch canvas for browsers whose WebGL will not take a VideoFrame
// directly. regl does not recognise OffscreenCanvas as a pixel source, so
// the fallback goes the long way round through getImageData.
const scratch = new OffscreenCanvas(1, 1)
const scratchContext = scratch.getContext('2d', {willReadFrequently: true})!

// Fast path: texSubImage2D accepts a VideoFrame directly. The 2D-canvas
// detour forces the YUV-to-RGB conversion through an extra copy, so it is
// kept only as the fallback. regl's binding cache is kept honest by
// restoring whatever texture it had bound.
let directUpload = true

function uploadFrame(texture: Regl.Texture2D, frame: VideoFrame) {
	if (directUpload && gl) {
		try {
			const handle = (texture as unknown as {_texture: {texture: WebGLTexture}})
				._texture.texture
			const previous = gl.getParameter(gl.TEXTURE_BINDING_2D)
			gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
			gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
			gl.bindTexture(gl.TEXTURE_2D, handle)
			gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, frame)
			gl.bindTexture(gl.TEXTURE_2D, previous)
			return
		} catch (error) {
			directUpload = false
			console.warn('direct VideoFrame upload failed, using canvas', error)
		}
	}
	const width = frame.displayWidth || frame.codedWidth
	const height = frame.displayHeight || frame.codedHeight
	if (scratch.width !== width || scratch.height !== height) {
		scratch.width = width
		scratch.height = height
	}
	scratchContext.drawImage(frame, 0, 0)
	const image = scratchContext.getImageData(0, 0, width, height)
	texture.subimage(image.data as unknown as Regl.TextureImageData)
}

// Uploads are costly enough on Safari (~6ms each) that two in one task
// would push a drawn frame past its slot; the setTimeout between jobs
// yields to any 'frame' message waiting in the queue.
let uploadQueue = Promise.resolve()

function enqueueUpload(job: () => void): Promise<void> {
	uploadQueue = uploadQueue.then(
		() =>
			new Promise<void>(resolve => {
				setTimeout(() => {
					try {
						job()
					} catch (error) {
						// A rejected queue would reject every upload after it,
						// and presents (which draws now wait on) with them
						console.error(error)
					}
					resolve()
				})
			})
	)
	return uploadQueue
}

/** Decode a frame and land it in the sprite's back texture. Chained per
 * sprite, so decodes and uploads never overlap within one decoder. */
function ensureUploaded(sprite: WorkerSprite, frame: number): Promise<void> {
	sprite.chain = sprite.chain
		.then(async () => {
			if (sprite.backFrame === frame) return
			await decodeFrame(sprite, frame)
			const decoded = sprite.frames.get(frame)
			if (!decoded) return
			await enqueueUpload(() => uploadFrame(sprite.back, decoded))
			decoded.close()
			sprite.frames.delete(frame)
			sprite.backFrame = frame
		})
		// A rejected link would poison the chain for good — absorb it; one
		// dropped frame beats a frozen automaton.
		.catch(error => console.error(error))
	return sprite.chain
}

async function load(sources: string[]) {
	if (typeof VideoDecoder === 'undefined') {
		ctx.postMessage({type: 'unsupported', reason: 'no VideoDecoder'})
		return
	}
	if (!new OffscreenCanvas(1, 1).getContext('webgl')) {
		ctx.postMessage({type: 'unsupported', reason: 'no worker WebGL'})
		return
	}

	try {
		sprites = await Promise.all(
			sources.map(async (src): Promise<WorkerSprite> => {
				const sprite = await createSpriteDecoder('/animondo/' + src)
				// Prime frame 0 now, so 'start' can give the front textures
				// real content without waiting on the decoders again
				await decodeFrame(sprite, 0)
				return {
					...sprite,
					front: null as unknown as Regl.Texture2D,
					back: null as unknown as Regl.Texture2D,
					backFrame: -1,
				}
			})
		)
		ctx.postMessage({type: 'loaded'})
	} catch (error) {
		// H.264 the browser will not decode, a fetch that failed — all of it
		// recoverable by the main-thread renderer
		ctx.postMessage({type: 'unsupported', reason: String(error)})
	}
}

function start(message: Extract<MainToWorker, {type: 'start'}>) {
	canvas = message.canvas
	gl = canvas.getContext('webgl', {
		// The scene is one full-screen quad: there is no geometry edge
		// for MSAA to smooth, so antialiasing only buys a 4x resolve
		// of a retina-sized canvas every frame — which Safari's Metal
		// backend pays for dearly during pan and zoom.
		antialias: false,
		premultipliedAlpha: true,
		powerPreference: 'high-performance',
	}) as WebGLRenderingContext | null
	if (!gl) throw new Error('no WebGL context on the offscreen canvas')

	regl = Regl({gl})

	for (const sprite of sprites) {
		// Linear, not regl's nearest default: the hand-drawn ink is shown
		// scaled by the zoom, and nearest turns its edges to staircases
		const filtered = {
			width: sprite.width,
			height: sprite.height,
			mag: 'linear',
			min: 'linear',
		} as const
		sprite.front = regl.texture(filtered)
		sprite.back = regl.texture(filtered)
		// The frame primed during 'load' gives the front real content, so
		// the texture is never seen blank
		const first = sprite.frames.get(0)
		if (first) {
			uploadFrame(sprite.front, first)
			first.close()
			sprite.frames.delete(0)
		}
	}

	tileMapTexture = regl.texture({
		width: message.tileMapWidth,
		height: message.tileMapHeight,
		format: 'rgb',
		type: 'uint8',
		mag: 'nearest',
		min: 'nearest',
		wrap: 'repeat',
	})

	// The crayon veil (see tile.frag). Until the image lands the 1x1 opaque
	// white placeholder reproduces the old flat fade, so a slow fetch only
	// delays the grain, never the piece. A failed fetch is the same story
	// for good, which is why it is not fatal.
	fadeMaskTexture = regl.texture({
		width: 1,
		height: 1,
		data: new Uint8Array([255, 255, 255, 255]),
		wrap: 'repeat',
		mag: 'linear',
		min: 'linear',
	})
	loadFadeMask().catch(error => console.warn('fade mask unavailable', error))

	drawCommand = regl({
		frag: message.frag,
		vert: message.vert,
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
			tileMapSize: [message.tileMapWidth, message.tileMapHeight],
			navMatrix: regl.prop<Record<string, unknown>, string>('navMatrix'),
			focusCell: regl.prop<Record<string, unknown>, string>('focusCell'),
			focusFade: regl.prop<Record<string, unknown>, string>('focusFade'),
			fadeMask: () => fadeMaskTexture,
			fadeMaskScale: regl.prop<Record<string, unknown>, string>('fadeMaskScale'),
			fadeMaskOffset: regl.prop<Record<string, unknown>, string>('fadeMaskOffset'),
		},
	})

	ctx.postMessage({type: 'ready'})
}

// regl does not take an ImageBitmap as a pixel source, so the veil goes the
// same long way round as the VideoFrame fallback: through the 2D scratch
// canvas into raw RGBA. A one-off upload, so the copy costs nothing that
// matters.
async function loadFadeMask() {
	const response = await fetch('/animondo/fade-mask.webp')
	if (!response.ok) throw new Error(`fade mask HTTP ${response.status}`)
	const bitmap = await createImageBitmap(await response.blob())
	scratch.width = bitmap.width
	scratch.height = bitmap.height
	scratchContext.drawImage(bitmap, 0, 0)
	const image = scratchContext.getImageData(0, 0, bitmap.width, bitmap.height)
	bitmap.close()
	fadeMaskTexture?.({
		width: image.width,
		height: image.height,
		// Rewrapped: regl is not to be trusted with a Uint8ClampedArray
		data: new Uint8Array(image.data.buffer),
		wrap: 'repeat',
		mag: 'linear',
		min: 'linear',
	})
}

async function present(frame: number, pixels?: Uint8Array) {
	await Promise.all(sprites.map(sprite => ensureUploaded(sprite, frame)))
	// One synchronous block: every sprite advances and the pattern lands
	// with them, so no draw can catch the stage half-turned
	for (const sprite of sprites) {
		if (sprite.backFrame !== frame) continue
		const {front, back} = sprite
		sprite.front = back
		sprite.back = front
		sprite.backFrame = -1
	}
	if (pixels) tileMapTexture?.subimage(pixels)
}

function drawFrame(message: Extract<MainToWorker, {type: 'frame'}>) {
	if (!regl || !drawCommand || !canvas) return
	if (canvas.width !== message.width || canvas.height !== message.height) {
		canvas.width = message.width
		canvas.height = message.height
	}
	regl.poll()
	regl.clear({color: [0, 0, 0, 0]})
	drawCommand({
		video0: sprites[0]!.front,
		video1: sprites[1]!.front,
		video2: sprites[2]!.front,
		video3: sprites[3]!.front,
		video4: sprites[4]!.front,
		video5: sprites[5]!.front,
		video6: sprites[6]!.front,
		video7: sprites[7]!.front,
		navMatrix: message.nav,
		focusCell: message.focusCell,
		focusFade: message.focusFade,
		fadeMaskScale: message.fadeMaskScale,
		fadeMaskOffset: message.fadeMaskOffset,
	})
}

// A draw must never be paired with a stage it does not belong to. present()
// is asynchronous — decode, upload, then the swap — while a draw is served
// the moment its message arrives, so a 'frame' posted after a 'present'
// paints the camera of the coming turn over the stage of the old one: the
// dancer pops a cell and snaps back, one frame later. The main thread moves
// the camera in the same tick it posts the present, so holding the draw
// until the swap lands is what pairs them again.
let presenting: Promise<void> | null = null
let heldFrame: Extract<MainToWorker, {type: 'frame'}> | null = null

let fatalReported = false

function reportFatal(error: unknown) {
	if (fatalReported) return
	fatalReported = true
	ctx.postMessage({type: 'error', message: String(error)})
}

ctx.addEventListener('message', event => {
	const message = event.data
	try {
		switch (message.type) {
			case 'load':
				load(message.sources)
				break
			case 'start':
				start(message)
				break
			case 'tilemap':
				tileMapTexture?.subimage(message.pixels)
				break
			case 'present': {
				const swap = present(message.frame, message.pixels).catch(error => {
					console.error(error)
				})
				presenting = swap
				swap.then(() => {
					// A newer present already has the floor; it will release
					// whatever draw is waiting
					if (presenting !== swap) return
					presenting = null
					const held = heldFrame
					heldFrame = null
					if (held) drawFrame(held)
				})
				break
			}
			case 'prepare':
				for (const sprite of sprites) ensureUploaded(sprite, message.frame)
				break
			case 'frame':
				// Only the newest camera is worth drawing when the swap lands
				if (presenting) heldFrame = message
				else drawFrame(message)
				break
		}
	} catch (error) {
		console.error(error)
		reportFatal(error)
	}
})
