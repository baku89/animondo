import {useResizeObserver, whenever} from '@vueuse/core'
import type {vec2} from 'linearly'
import Regl from 'regl'

import DefaultVertexShader from '~/components/shaders/default.vert?raw'

interface UseReglOptions<Uniforms extends Record<string, any>> {
	frag: string
	enableRaf?: boolean
	size?: vec2 | null
	onInit: (regl: Regl.Regl, render: () => void) => Promise<Record<string, any>>
	onFrame: () => Partial<Uniforms> | null | undefined
}

export function useRegl<Uniforms extends Record<string, any>>(
	canvas: Ref<HTMLCanvasElement | null>,
	options: UseReglOptions<Uniforms>
) {
	let regl: Regl.Regl | null = null
	const {enableRaf = true, size = null} = options

	let actualRenderFunc: (() => void) | null = null

	const render = () => {
		actualRenderFunc?.()
	}

	whenever(canvas, async canvas => {
		if (regl) {
			regl.destroy()
		}

		regl = Regl({
			canvas,
			attributes: {
				antialias: true,
				premultipliedAlpha: true,
			},
		})

		const uniforms = await options.onInit(regl, render)

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
			uniforms,
		})

		actualRenderFunc = () => {
			const props = options.onFrame()

			if (!props) {
				return
			}

			regl!.clear({
				color: [0, 0, 0, 0],
			})

			draw(props)
		}

		if (enableRaf) {
			regl.frame(actualRenderFunc)
		} else {
			regl.frame(() => {})
		}

		// Resize
		if (!size) {
			useResizeObserver(canvas, () => {
				const dpi = window.devicePixelRatio
				canvas.width = canvas.clientWidth * dpi
				canvas.height = canvas.clientHeight * dpi
			})
		} else {
			canvas.width = size[0]
			canvas.height = size[1]
		}
	})
}
