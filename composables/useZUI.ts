import {useElementSize, useEventListener} from '@vueuse/core'
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

	// ホイールでズーム
	useEventListener(element, 'wheel', event => {
		const delta = 1 + -event.deltaY / 400

		let scaled = mat2d.mul(mat2d.scaling(delta), transform.value)

		const scale = scaled[0]

		if (scale > 2) {
			scaled = mat2d.mul(mat2d.scaling(2 / scale), scaled)
		} else if (scale < 0.025) {
			scaled = mat2d.mul(mat2d.scaling(0.025 / scale), scaled)
		}

		transform.value = scaled
	})

	// ドラッグで平行移動
	let prev: vec2 | null = null

	useEventListener(element, 'pointerdown', event => {
		// capture pointer
		;(event.target as HTMLElement).setPointerCapture(event.pointerId)
		prev = [event.clientX, event.clientY]
	})

	useEventListener(element, 'pointermove', event => {
		if (!prev) return
		const current: vec2 = [event.clientX, event.clientY]
		const delta = vec2.sub(current, prev)

		// Normalize
		const scaledDelta = vec2.scale(delta, 2 / width.value)

		transform.value = mat2d.mul(mat2d.translation(scaledDelta), transform.value)
		prev = current
	})

	function onPointerUp() {
		prev = null
	}

	useEventListener(element, 'pointerup', onPointerUp)
	useEventListener(element, 'pointercancel', onPointerUp)
	useEventListener(element, 'pointerout', onPointerUp)
	useEventListener(element, 'pointerleave', onPointerUp)

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
	}
}
