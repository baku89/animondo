import {useElementSize, useEventListener} from '@vueuse/core'
import {mat2d, mat3, vec2} from 'linearly'

import * as Patterns from '@/utils/patterns'

// Opening zoom: this many cells across the viewport's SHORT side, whatever
// size the pattern grid is (its width only sets the tiling period)
const OPENING_CELLS = 8

export function useZUI(element: Ref<HTMLElement | null>) {
	const {width, height} = useElementSize(element)

	// The centred view with this many cells across the short side — the
	// opening's framing, and the dolly's rail. Before the element is
	// measured it assumes portrait (short side = width).
	function centredTransform(cells: number) {
		const scale = (2 * Patterns.size.width) / cells
		const aspect =
			width.value && height.value
				? Math.min(width.value, height.value) / width.value
				: 1
		return mat2d.mul(
			mat2d.scaling(scale * aspect),
			mat2d.translation(-0.5),
			mat2d.scaling(1 / Patterns.size.width)
		)
	}

	const transform = ref(centredTransform(OPENING_CELLS))

	// The static default above assumes portrait; once the element is
	// measured, correct for landscape, where the short side is the height.
	let zoomInitialized = false
	watch([width, height], ([w, h]) => {
		if (zoomInitialized || !w || !h) return
		zoomInitialized = true
		transform.value = centredTransform(OPENING_CELLS)
	})

	/** Point the camera at the centred view with this many cells across the
	 * short side — the opening dolly drives this every frame. Overwrites
	 * whatever the transform holds, so only for while the stage is locked. */
	function setOpeningCells(cells: number) {
		transform.value = centredTransform(cells)
	}

	// Zoom about a screen position (clientX/Y), clamping the scale
	function zoomBy(delta: number, clientX: number, clientY: number) {
		const el = element.value
		if (!el) return

		const scale = transform.value[0]
		const clamped = Math.min(Math.max(scale * delta, 0.025), 2) / scale

		// Convert the screen position to the post-transform space
		// (same convention as the drag pan below: origin at the element
		// center, y down, 2/width units per CSS pixel)
		const rect = el.getBoundingClientRect()
		const origin: vec2 = vec2.scale(
			[
				clientX - (rect.left + rect.width / 2),
				clientY - (rect.top + rect.height / 2),
			],
			2 / width.value
		)

		transform.value = mat2d.mul(
			mat2d.pivot(mat2d.scaling(clamped), origin),
			transform.value
		)
		notifyNavigate()
	}

	// Wheel scroll and trackpad pinch (delivered as wheel with ctrlKey
	// on Chrome / Firefox / Edge). preventDefault is required to stop
	// ctrl+wheel from triggering the browser's page zoom.
	useEventListener(
		element,
		'wheel',
		event => {
			event.preventDefault()
			const speed = event.ctrlKey ? 100 : 400
			const delta = Math.exp(-event.deltaY / speed)
			zoomBy(delta, event.clientX, event.clientY)
		},
		{passive: false}
	)

	// Trackpad pinch on desktop Safari (non-standard GestureEvent)
	interface SafariGestureEvent extends UIEvent {
		scale: number
		clientX: number
		clientY: number
	}

	let lastGestureScale = 1

	useEventListener(
		element,
		'gesturestart' as 'wheel',
		event => {
			event.preventDefault()
			lastGestureScale = (event as unknown as SafariGestureEvent).scale
		},
		{passive: false}
	)

	useEventListener(
		element,
		'gesturechange' as 'wheel',
		event => {
			event.preventDefault()
			// On iOS these fire alongside the touch pointer events that already
			// drive the pinch below; only trust them when no touch is down
			// (i.e. a desktop Safari trackpad).
			if (pointers.size > 0) return
			const {scale, clientX, clientY} = event as unknown as SafariGestureEvent
			zoomBy(scale / lastGestureScale, clientX, clientY)
			lastGestureScale = scale
		},
		{passive: false}
	)

	// ドラッグで平行移動、2 本指でピンチズーム
	// A press only becomes a drag after the pointer travels past
	// TAP_THRESHOLD px; shorter presses fire the tap handlers instead.
	const TAP_THRESHOLD = 8

	// Every active pointer, keyed by pointerId, in client pixels. One pointer
	// pans; the first two drive a pinch (pan by their midpoint, zoom by their
	// distance). Keeping them in one map is the point — the old single `prev`
	// variable was overwritten by both fingers in turn, which is what made
	// two-finger touches jump around.
	const pointers = new Map<number, vec2>()
	let downPos: vec2 | null = null
	let dragging = false
	let multiTouched = false

	// Pan velocity in normalized units per ms, smoothed while the pointer
	// moves; released as a glide (momentum) on pointerup.
	let velocity: vec2 = vec2.zero
	let lastMoveAt = 0
	let glide: vec2 | null = null

	type TapHandler = (clientX: number, clientY: number) => void
	const tapHandlers: TapHandler[] = []

	function onTap(handler: TapHandler) {
		tapHandlers.push(handler)
	}

	// Fired whenever a GESTURE moves the camera — a drag pan, a pinch, a
	// wheel zoom — and not when the camera moves by itself (follow, glide).
	// The explore hint listens: once the visitor has done the thing it asks
	// for, it can stop asking.
	type NavigateHandler = () => void
	const navigateHandlers: NavigateHandler[] = []

	function onNavigate(handler: NavigateHandler) {
		navigateHandlers.push(handler)
	}

	function notifyNavigate() {
		for (const handler of navigateHandlers) handler()
	}

	useEventListener(element, 'pointerdown', event => {
		try {
			element.value?.setPointerCapture(event.pointerId)
		} catch {
			// An already-released (or synthetic) pointer cannot be captured
		}
		pointers.set(event.pointerId, [event.clientX, event.clientY])
		glide = null

		if (pointers.size === 1) {
			downPos = [event.clientX, event.clientY]
			dragging = false
			multiTouched = false
			velocity = vec2.zero
			lastMoveAt = event.timeStamp
		} else {
			// A second finger means a pinch: never a tap, never a glide,
			// and it releases the camera from any followed target
			multiTouched = true
			dragging = true
			followTarget.value = null
		}
	})

	useEventListener(element, 'pointermove', event => {
		const previous = pointers.get(event.pointerId)
		if (!previous) return
		const current: vec2 = [event.clientX, event.clientY]

		if (pointers.size >= 2) {
			pointers.set(event.pointerId, current)

			const [idA, idB] = pointers.keys()
			if (event.pointerId !== idA && event.pointerId !== idB) return

			const other = pointers.get(event.pointerId === idA ? idB : idA)!
			const prevMid = vec2.lerp(previous, other, 0.5)
			const mid = vec2.lerp(current, other, 0.5)
			const prevDist = vec2.distance(previous, other)
			const dist = vec2.distance(current, other)

			transform.value = mat2d.mul(
				mat2d.translation(vec2.scale(vec2.sub(mid, prevMid), 2 / width.value)),
				transform.value
			)
			notifyNavigate()
			if (prevDist > 0 && dist > 0) {
				zoomBy(dist / prevDist, mid[0], mid[1])
			}
			return
		}

		if (!dragging) {
			if (downPos && vec2.distance(current, downPos) > TAP_THRESHOLD) {
				dragging = true
				// A deliberate pan releases the camera from any followed target
				followTarget.value = null
			} else {
				pointers.set(event.pointerId, current)
				return
			}
		}

		const delta = vec2.sub(current, previous)

		// Normalize
		const scaledDelta = vec2.scale(delta, 2 / width.value)

		transform.value = mat2d.mul(mat2d.translation(scaledDelta), transform.value)
		notifyNavigate()
		pointers.set(event.pointerId, current)

		const dt = event.timeStamp - lastMoveAt
		if (dt > 0) {
			// Exponential smoothing over ~50ms, so the glide picks up the
			// speed of the last few frames rather than one noisy event
			const k = 1 - Math.exp(-dt / 50)
			velocity = vec2.lerp(velocity, vec2.scale(scaledDelta, 1 / dt), k)
			lastMoveAt = event.timeStamp
		}
	})

	function releasePointer(event: PointerEvent, canTap: boolean) {
		if (!pointers.delete(event.pointerId)) return
		// When a pinch drops to one finger, that finger keeps panning
		if (pointers.size > 0) return

		if (canTap && downPos && !dragging && !multiTouched) {
			tapHandlers.forEach(handler => handler(event.clientX, event.clientY))
		} else if (dragging && !multiTouched) {
			// A flick keeps gliding — unless the finger had already paused
			const paused = event.timeStamp - lastMoveAt > 100
			const pxPerMs = (vec2.len(velocity) * width.value) / 2
			if (!paused && pxPerMs > 0.05) glide = velocity
		}

		downPos = null
		dragging = false
	}

	useEventListener(element, 'pointerup', event => releasePointer(event, true))
	useEventListener(element, 'pointercancel', e => releasePointer(e, false))
	useEventListener(element, 'pointerout', e => releasePointer(e, false))
	useEventListener(element, 'pointerleave', e => releasePointer(e, false))

	// Momentum: keep panning after a flick, with exponential friction.
	// Advanced from the same pre-draw callback as the follow (syncCamera),
	// not a rAF of our own, for the same atomicity reason as below.
	let lastGlideAt: number | null = null

	function syncGlide() {
		if (!glide) {
			lastGlideAt = null
			return
		}
		if (followTarget.value) {
			// The follow owns the camera
			glide = null
			return
		}

		const now = performance.now()
		const dt = lastGlideAt === null ? 1000 / 60 : now - lastGlideAt
		lastGlideAt = now

		transform.value = mat2d.mul(
			mat2d.translation(vec2.scale(glide, dt)),
			transform.value
		)

		glide = vec2.scale(glide, Math.exp(-dt / 280))
		if ((vec2.len(glide) * width.value) / 2 < 0.005) glide = null
	}

	// Convert a pattern-space position to a screen position (clientX/Y)
	function worldToScreen(v: vec2): vec2 {
		const el = element.value
		if (!el) return vec2.zero

		const rect = el.getBoundingClientRect()
		const norm = vec2.transformMat2d(v, transform.value)
		return [
			norm[0] * (width.value / 2) + rect.left + rect.width / 2,
			norm[1] * (width.value / 2) + rect.top + rect.height / 2,
		]
	}

	// Convert a screen position (clientX/Y) to pattern-space cell coordinates.
	// An unmeasured element (width 0 — display:none, or the first frames of a
	// remote load) would divide into Infinity and NaN every cell index
	// downstream; answer from the origin instead of poisoning the automaton.
	function screenToWorld(clientX: number, clientY: number): vec2 {
		const el = element.value
		if (!el || !width.value) return vec2.zero

		const rect = el.getBoundingClientRect()
		const norm: vec2 = vec2.scale(
			[
				clientX - (rect.left + rect.width / 2),
				clientY - (rect.top + rect.height / 2),
			],
			2 / width.value
		)

		const inverted = mat2d.invert(transform.value)
		return inverted ? vec2.transformMat2d(norm, inverted) : norm
	}

	// カメラ追尾: followTarget（パターン空間座標）が followAnchor（スクリーン
	// 座標、null なら画面中央）に来るよう平行移動成分だけを合わせる。
	// 2 種類の移動を区別する ——
	//   寄り: 追尾を始めた直後、選択位置までカメラを運ぶ移動。ease-out で滑らかに
	//   追従: 以降のコマ送りに合わせる移動。補間しない —— 踊り手は 8.8Hz で
	//         コマを進めるので、カメラも同じ刻みで飛ばした方が手触りが揃う
	const followTarget = ref<vec2 | null>(null)

	/** How long the approach takes to settle onto the dancer */
	const APPROACH_MS = 650

	// Where the camera was when the follow began; null once settled
	let approach: {tx: number; ty: number; since: number} | null = null

	watch(followTarget, (target, previous) => {
		if (target && !previous) {
			const [, , , , tx, ty] = transform.value
			approach = {tx, ty, since: performance.now()}
		} else if (!target) {
			approach = null
		}
	})

	/** Screen point (clientX/Y) the followed target is steered toward;
	 * the element's centre when null */
	const followAnchor = ref<vec2 | null>(null)

	// Called from the render loop, right before the frame is drawn — NOT
	// from a rAF of our own. Two independent rAF subscriptions can land a
	// frame apart from each other, and then every automaton step renders
	// once with the dancer in the new cell but the camera still on the old
	// one — a one-frame twitch. Sampling the camera in the same callback
	// that draws makes the two atomically consistent.
	function syncFollow() {
		const target = followTarget.value
		const el = element.value
		if (!target || !el) return

		// The anchor lives in client pixels; bring it into the same
		// normalized space the transform maps the world into (origin at the
		// element centre, 2/width units per CSS pixel).
		let anchor: vec2 = vec2.zero
		if (followAnchor.value) {
			const rect = el.getBoundingClientRect()
			anchor = vec2.scale(
				[
					followAnchor.value[0] - (rect.left + rect.width / 2),
					followAnchor.value[1] - (rect.top + rect.height / 2),
				],
				2 / width.value
			)
		}

		const [a, b, c, d, tx, ty] = transform.value
		const desiredTx = anchor[0] - (a * target[0] + c * target[1])
		const desiredTy = anchor[1] - (b * target[0] + d * target[1])

		if (approach) {
			// Carry the camera over on an ease-out. The destination keeps
			// stepping with the dancer's frames while we travel, so this
			// converges on a moving target and hands over cleanly.
			const t = (performance.now() - approach.since) / APPROACH_MS
			if (t >= 1) {
				approach = null
			} else {
				const e = 1 - (1 - t) ** 3
				transform.value = [
					a,
					b,
					c,
					d,
					approach.tx + (desiredTx - approach.tx) * e,
					approach.ty + (desiredTy - approach.ty) * e,
				]
				return
			}
		}

		// Settled: follow exactly. The target only moves when the dancer's
		// frame does, so snapping keeps the camera on the same 8.8Hz grid.
		if (tx === desiredTx && ty === desiredTy) return

		transform.value = [a, b, c, d, desiredTx, desiredTy]
	}

	/** Advance every camera animation (flick glide, follow) — called from the
	 * render loop right before drawing */
	function syncCamera() {
		syncGlide()
		syncFollow()
	}

	/** Screen pixels per pattern cell at the current zoom */
	const pixelsPerCell = computed(() => (transform.value[0] * width.value) / 2)

	const matrix = computed<mat3.Mutable>(() => {
		const [a, b, c, d, tx, ty] = transform.value
		return [a, b, 0, c, d, 0, tx, ty, 1]
	})

	const inverseMatrix = computed<mat3.Mutable>(() => {
		return [...(mat3.invert(matrix.value) ?? mat3.ident)]
	})

	return {
		matrix,
		inverseMatrix,
		onTap,
		onNavigate,
		screenToWorld,
		worldToScreen,
		followTarget,
		followAnchor,
		syncCamera,
		setOpeningCells,
		pixelsPerCell,
	}
}
