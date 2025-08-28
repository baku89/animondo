import {useEventListener} from '@vueuse/core'
import {mat2d, mat3} from 'linearly'

export function useZUI(element: Ref<HTMLElement | null>) {
	const transform = ref(mat2d.scaling(0.25))

	useEventListener(element, 'wheel', event => {
		transform.value = mat2d.translate(transform.value, [
			event.deltaX / 100,
			event.deltaY / 100,
		])
	})

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
