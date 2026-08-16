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

	const {width} = useElementSize(element)

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

	// カメラ追尾: followTarget（パターン空間座標）が画面中央に来るよう
	// 毎フレーム平行移動成分だけを指数的に補間する
	const followTarget = ref<vec2 | null>(null)

	useRafFn(({delta}) => {
		const target = followTarget.value
		if (!target) return

		const [a, b, c, d, tx, ty] = transform.value
		const desiredTx = -(a * target[0] + c * target[1])
		const desiredTy = -(b * target[0] + d * target[1])

		const k = 1 - Math.exp(-delta / 450)

		transform.value = [
			a,
			b,
			c,
			d,
			tx + (desiredTx - tx) * k,
			ty + (desiredTy - ty) * k,
		]
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
		pixelsPerCell,
	}
}
