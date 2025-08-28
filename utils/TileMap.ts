import type Regl from 'regl'
import {Array2D} from './Array2D'
import {
	Direction,
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

	#patternGenerator: ((loop: number) => MovePattern) | null = null
	#currentLoop: number = 0
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

	setMovePattern(patternGenerator: (loop: number) => MovePattern) {
		this.#patternGenerator = patternGenerator
		this.#currentLoop = 0
		this.#currentPattern = this.#patternGenerator(this.#currentLoop)
		this.#updateTexture()
	}

	/**
	 * タイル上のビデオインデックスを更新する
	 */
	nextStep() {
		if (!this.#patternGenerator) return

		// Advance to next loop and get pattern
		const pattern = this.#patternGenerator(++this.#currentLoop)
		this.#currentPattern = pattern

		// Validate pattern dimensions
		if (pattern.width !== this.width || pattern.height !== this.height) {
			console.error(
				`Pattern dimensions (${pattern.width}x${pattern.height}) ` +
					`do not match TileMap dimensions (${this.width}x${this.height}) at loop ${this.#currentLoop}`
			)
			return
		}

		const indices = this.#indices

		// const nextIndices = new Array2D(this.width, this.height, (x, y) => {
		// 	if (this.#indices.get(x - 1, y) ===
		// })
		this.#indices = this.#indices.map((x, y) => {
			// Check left
			if (pattern.get(x - 1, y).out === Direction.Right) {
				return indices.get(x - 1, y)
			}
			// Check Up
			if (pattern.get(x, y - 1).out === Direction.Down) {
				return indices.get(x, y - 1)
			}
			// Check Right
			if (pattern.get(x + 1, y).out === Direction.Left) {
				return indices.get(x + 1, y)
			}
			// Check Down
			if (pattern.get(x, y + 1).out === Direction.Up) {
				return indices.get(x, y + 1)
			}

			// どこからも流入していないときはランダムに
			return Math.round(Math.random())
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
