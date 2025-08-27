import {useResizeObserver, whenever} from '@vueuse/core'
import Regl from 'regl'

import DefaultVertexShader from '~/components/shaders/default.vert?raw'

interface UseReglOptions<Uniforms extends Record<string, any>> {
	frag: string
	onInit: (regl: Regl.Regl) => Promise<Record<string, any>>
	onFrame: (
		context: Regl.DefaultContext
	) => Partial<Uniforms> | null | undefined
	onInitialDraw?: () => void
}

export function useRegl<Uniforms extends Record<string, any>>(
	canvas: Ref<HTMLCanvasElement | null>,
	options: UseReglOptions<Uniforms>
) {
	let regl: Regl.Regl | null = null

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

		const uniforms = await options.onInit(regl)

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

		let initialDraw = true

		regl.frame(context => {
			const props = options.onFrame(context)

			if (!props) {
				return
			}

			regl!.clear({
				color: [0, 0, 0, 0],
			})

			draw(props)

			if (initialDraw) {
				initialDraw = false
				options.onInitialDraw?.()
			}
		})

		// Resize
		useResizeObserver(canvas, resizeCanvas)

		function resizeCanvas() {
			const dpi = window.devicePixelRatio
			canvas.width = canvas.clientWidth * dpi
			canvas.height = canvas.clientHeight * dpi
		}

		resizeCanvas()
	})
}
