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

const HonamiIndex = 5

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
	#pixels: Uint8Array

	/** OpenGL用のタイル情報をカラー値として保存したテクスチャ。 */
	#texture: Regl.Texture2D

	#patternGenerator: Generator<MovePattern, never, void> | null = null
	#currentPattern: MovePattern | null = null
	#nextPattern: MovePattern | null = null

	/** 各タイルのビデオインデックス */
	#tileInfo: Array2D<{index: number; flipVertical: boolean}>

	constructor(readonly options: TileMapOptions) {
		this.width = options.width
		this.height = options.height
		this.numberOfVideos = options.numberOfVideos

		this.#pixels = new Uint8Array(this.width * this.height * 3)
		this.#tileInfo = new Array2D({
			width: this.width,
			height: this.height,
			initialize: this.#generateTileInfoRandomly,
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

	#generateTileInfoRandomly = () => {
		return {
			index: Math.floor(Math.random() * this.numberOfVideos),
			flipVertical: false,
		}
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
			this.#tileInfo = this.#tileInfo.map((x, y, _, tileInfo) => {
				let info: {index: number; flipVertical: boolean} | undefined
				let neighbourMove: Move | undefined

				// Check left
				neighbourMove = previousPattern.get(x - 1, y)
				if (neighbourMove.out === Direction.Right) {
					info = tileInfo.get(x - 1, y)
				}
				// Check Up
				neighbourMove = previousPattern.get(x, y - 1)
				if (neighbourMove.out === Direction.Down) {
					info = tileInfo.get(x, y - 1)
				}
				// Check Right
				neighbourMove = previousPattern.get(x + 1, y)
				if (neighbourMove.out === Direction.Left) {
					info = tileInfo.get(x + 1, y)
				}
				// Check Down
				neighbourMove = previousPattern.get(x, y + 1)
				if (neighbourMove.out === Direction.Up) {
					info = tileInfo.get(x, y + 1)
				}

				if (info) {
					if (
						info.index === HonamiIndex &&
						neighbourMove.in === neighbourMove.out
					) {
						return {
							...info,
							flipVertical: !info.flipVertical,
						}
					}
					return info
				}

				// どこからも流入していないときはランダムに
				return this.#generateTileInfoRandomly()
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
				const info = this.#tileInfo.get(x, y)
				const tileDisplay = moveToTileDisplay(
					move,
					info.index,
					info.flipVertical
				)

				const offset = (y * this.width + x) * 3

				const [index, state] = tileDisplayToColorValue(tileDisplay)

				this.#pixels[offset] = index
				this.#pixels[offset + 1] = state
			}
		})

		this.#texture.subimage(this.#pixels)
	}

	// 破棄
	destroy() {
		this.#texture.destroy()
	}
}
