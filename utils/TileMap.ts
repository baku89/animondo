import type Regl from 'regl'
import {Array2D} from './Array2D'
import type {MovePattern} from './patterns'
import {Direction, moveToTileDisplay, tileDisplayToColorValue} from './tile'

interface TileMapOptions {
	regl: Regl.Regl
	width: number
	height: number
	numberOfVideos: number
}

// 2つのパターンがつながるようなパターンを作る
function interpolateMovePattens(
	pattern1: MovePattern,
	pattern2: MovePattern
): MovePattern {
	return pattern1.map((x, y, move1) => {
		const move2 = pattern2.get(x, y)
		return {
			in: move1.in,
			out: move2.out,
		}
	})
}

/**
 * タイルの状態や、シェーダー用のマップテクスチャを管理する
 */
export class TileMap {
	readonly width: number
	readonly height: number
	readonly numberOfVideos: number

	/** タイル情報を格納したテクスチャのデータ。赤にindex, 緑にその他の情報を格納 */
	#data: Uint8Array

	#texture: Regl.Texture2D

	#patternGenerator: Generator<MovePattern, never, void> | null = null
	#currentPattern: MovePattern | null = null
	#nextPattern: MovePattern | null = null

	/** 各タイルのビデオインデックス */
	#indices: Array2D<number>

	constructor(readonly options: TileMapOptions) {
		this.width = options.width
		this.height = options.height
		this.numberOfVideos = options.numberOfVideos

		this.#data = new Uint8Array(this.width * this.height * 3)
		this.#indices = new Array2D({
			width: this.width,
			height: this.height,
			initialize: (x, y) => Math.floor(Math.random() * this.numberOfVideos),
		})

		this.#texture = this.options.regl.texture({
			width: this.width,
			height: this.height,
			format: 'rgb',
			type: 'uint8',
			mag: 'nearest',
			min: 'nearest',
			wrap: 'repeat',
		})
	}

	get texture(): Regl.Texture2D {
		return this.#texture
	}

	setMovePattern(
		patternGeneratorFn: () => Generator<MovePattern, never, void>
	) {
		this.#patternGenerator = patternGeneratorFn()

		// ジェネレーターから最初の2つのパターンを取得してキャッシュ
		const firstResult = this.#patternGenerator.next()
		const secondResult = this.#patternGenerator.next()

		if (firstResult.done || secondResult.done) {
			throw new Error('Pattern generator must yield at least 2 patterns')
		}

		this.#currentPattern = firstResult.value
		this.#nextPattern = secondResult.value

		// 初期状態は遷移パターン (0-1) から開始
		this.#currentPattern = interpolateMovePattens(
			firstResult.value,
			secondResult.value
		)

		this.#updateTexture()
	}

	/**
	 * タイル上のビデオインデックスを更新する
	 * ステップ: 0-1, 1-2, 2-3, 3-4, ...
	 */
	nextStep() {
		// Update indices based on current pattern
		const previousPattern = this.#currentPattern

		if (previousPattern) {
			this.#indices = this.#indices.map((x, y, _, indices) => {
				// Check left
				if (previousPattern.get(x - 1, y).out === Direction.Right) {
					return indices.get(x - 1, y)
				}
				// Check Up
				if (previousPattern.get(x, y - 1).out === Direction.Down) {
					return indices.get(x, y - 1)
				}
				// Check Right
				if (previousPattern.get(x + 1, y).out === Direction.Left) {
					return indices.get(x + 1, y)
				}
				// Check Down
				if (previousPattern.get(x, y + 1).out === Direction.Up) {
					return indices.get(x, y + 1)
				}

				// どこからも流入していないときはランダムに
				return Math.floor(Math.random() * this.numberOfVideos)
			})
		}

		if (!this.#patternGenerator || !this.#nextPattern) return

		// 常にトランジション: currentStep → currentStep+1
		const nextPattern = this.#patternGenerator.next()

		if (nextPattern.done) {
			return
		}

		this.#currentPattern = interpolateMovePattens(
			this.#nextPattern,
			nextPattern.value
		)

		this.#nextPattern = nextPattern.value

		this.#updateTexture()
	}

	// テクスチャを更新（GPUに送信）
	#updateTexture() {
		if (!this.#currentPattern) return

		this.#currentPattern.iterate((x, y, move) => {
			if (move) {
				const tileDisplay = moveToTileDisplay(move, this.#indices.get(x, y))
				const offset = (y * this.width + x) * 3
				const [index, state] = tileDisplayToColorValue(tileDisplay)
				this.#data[offset] = index
				this.#data[offset + 1] = state
			}
		})

		this.#texture.subimage(this.#data)
	}

	// 破棄
	destroy() {
		this.#texture.destroy()
	}
}
