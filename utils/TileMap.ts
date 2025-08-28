import type Regl from 'regl'
import {Array2D} from './Array2D'
import {
	Direction,
	interpolateMovePattens,
	moveToTileDisplay,
	tileDisplayToUint8,
	type MovePattern,
} from './tile'

/**
 * タイルの状態や、シェーダー用のマップテクスチャを管理する
 */
export class TileMap {
	#data: Uint8Array
	#texture: Regl.Texture2D

	#patternGenerator: ((step: number) => MovePattern) | null = null
	#currentStep: number = 0
	#currentPattern: MovePattern | null = null

	/** 各タイルのビデオインデックス */
	#indices: Array2D<number>

	constructor(
		readonly regl: Regl.Regl,
		readonly width: number,
		readonly height: number
	) {
		this.#data = new Uint8Array(this.width * this.height)
		this.#indices = new Array2D({
			width: this.width,
			height: this.height,
			initialize: (x, y) => (x + y) % 2,
		})

		this.#texture = this.regl.texture({
			width: this.width,
			height: this.height,
			format: 'luminance',
			type: 'uint8',
			mag: 'nearest',
			min: 'nearest',
			wrap: 'repeat',
		})
	}

	get texture(): Regl.Texture2D {
		return this.#texture
	}

	setMovePattern(patternGenerator: (step: number) => MovePattern) {
		this.#patternGenerator = patternGenerator
		this.#currentStep = 0

		// 初期状態も遷移パターン (0-1) から開始
		this.#currentPattern = this.#patternGenerator(0)

		this.#updateTexture()
	}

	/**
	 * タイル上のビデオインデックスを更新する
	 * ステップ: 0-1, 1-2, 2-3, 3-4, ...
	 */
	nextStep() {
		if (!this.#patternGenerator) return

		// 常にトランジション: currentStep → currentStep+1
		const currentPatternIndex = this.#currentStep
		const nextPatternIndex = this.#currentStep + 1

		const pattern1 = this.#patternGenerator(currentPatternIndex)
		const pattern2 = this.#patternGenerator(nextPatternIndex)

		// Validate dimensions
		if (
			pattern1.width !== this.width ||
			pattern1.height !== this.height ||
			pattern2.width !== this.width ||
			pattern2.height !== this.height
		) {
			console.error(`Pattern dimensions mismatch at step ${this.#currentStep}`)
			return
		}

		this.#currentPattern = interpolateMovePattens(pattern1, pattern2)
		this.#currentStep++

		// Update indices based on current pattern
		this.#indices = this.#indices.map((x, y, _, indices) => {
			if (!this.#currentPattern) return 0

			// Check left
			if (this.#currentPattern.get(x - 1, y).out === Direction.Right) {
				return indices.get(x - 1, y)
			}
			// Check Up
			if (this.#currentPattern.get(x, y - 1).out === Direction.Down) {
				return indices.get(x, y - 1)
			}
			// Check Right
			if (this.#currentPattern.get(x + 1, y).out === Direction.Left) {
				return indices.get(x + 1, y)
			}
			// Check Down
			if (this.#currentPattern.get(x, y + 1).out === Direction.Up) {
				return indices.get(x, y + 1)
			}

			// どこからも流入していないときは0
			return 0
		})

		this.#updateTexture()
	}

	// テクスチャを更新（GPUに送信）
	#updateTexture() {
		if (!this.#currentPattern) return

		this.#currentPattern.iterate((x, y, move) => {
			if (move) {
				const tileDisplay = moveToTileDisplay(move, this.#indices.get(x, y))
				const index = y * this.width + x
				const uint8 = tileDisplayToUint8(tileDisplay)
				this.#data[index] = uint8
			}
		})

		this.#texture.subimage(this.#data)
	}

	// 破棄
	destroy() {
		this.#texture.destroy()
	}
}
