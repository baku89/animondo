import {useElementSize, useEventListener, useRafFn} from '@vueuse/core'
import {mat2d, mat3, vec2} from 'linearly'

import * as Patterns from '@/utils/patterns'

export function useZUI(element: Ref<HTMLElement | null>) {
	const transform = ref(
		mat2d.mul(
			mat2d.scaling(4),

			mat2d.translation(-0.5),
			mat2d.scaling(1 / Patterns.size.width)
		)
	)

	const {width, height} = useElementSize(element)

	// Opening zoom: eight cells across the viewport's SHORT side. The static
	// default above assumes portrait; once the element is measured, correct
	// for landscape, where the short side is the height.
	let zoomInitialized = false
	watch([width, height], ([w, h]) => {
		if (zoomInitialized || !w || !h) return
		zoomInitialized = true
		transform.value = mat2d.mul(
			mat2d.scaling((4 * Math.min(w, h)) / w),
			mat2d.translation(-0.5),
			mat2d.scaling(1 / Patterns.size.width)
		)
	})

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
			const {scale, clientX, clientY} = event as unknown as SafariGestureEvent
			zoomBy(scale / lastGestureScale, clientX, clientY)
			lastGestureScale = scale
		},
		{passive: false}
	)

	// ドラッグで平行移動
	// A press only becomes a drag after the pointer travels past
	// TAP_THRESHOLD px; shorter presses fire the tap handlers instead.
	const TAP_THRESHOLD = 8

	let prev: vec2 | null = null
	let downPos: vec2 | null = null
	let dragging = false

	type TapHandler = (clientX: number, clientY: number) => void
	const tapHandlers: TapHandler[] = []

	function onTap(handler: TapHandler) {
		tapHandlers.push(handler)
	}

	useEventListener(element, 'pointerdown', event => {
		// capture pointer
		;(event.target as HTMLElement).setPointerCapture(event.pointerId)
		prev = [event.clientX, event.clientY]
		downPos = prev
		dragging = false
	})

	useEventListener(element, 'pointermove', event => {
		if (!prev) return
		const current: vec2 = [event.clientX, event.clientY]

		if (!dragging) {
			if (downPos && vec2.distance(current, downPos) > TAP_THRESHOLD) {
				dragging = true
				// A deliberate pan releases the camera from any followed target
				followTarget.value = null
			} else {
				prev = current
				return
			}
		}

		const delta = vec2.sub(current, prev)

		// Normalize
		const scaledDelta = vec2.scale(delta, 2 / width.value)

		transform.value = mat2d.mul(mat2d.translation(scaledDelta), transform.value)
		prev = current
	})

	useEventListener(element, 'pointerup', event => {
		if (downPos && !dragging) {
			tapHandlers.forEach(handler => handler(event.clientX, event.clientY))
		}
		prev = null
		downPos = null
	})

	function onPointerUp() {
		prev = null
		downPos = null
	}

	useEventListener(element, 'pointercancel', onPointerUp)
	useEventListener(element, 'pointerout', onPointerUp)
	useEventListener(element, 'pointerleave', onPointerUp)

	// Convert a screen position (clientX/Y) to pattern-space cell coordinates
	function screenToWorld(clientX: number, clientY: number): vec2 {
		const el = element.value
		if (!el) return vec2.zero

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

	useRafFn(() => {
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
	})

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
		screenToWorld,
		followTarget,
		followAnchor,
		pixelsPerCell,
	}
}
