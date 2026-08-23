import {vec2} from 'linearly'

import {Array2D} from './Array2D'
import {MovePattern} from './patterns'
import {Direction, moveToTileDisplay, tileDisplayToColorValue} from './tile'

interface TileMapOptions {
	width: number
	height: number
	numberOfVideos: number
	generateTileInfo?: (
		step: number,
		pos: vec2,
		bornCount: number
	) => {index: number; flipVertical: boolean}
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

type TileInfoGenerator = (
	step: number,
	pos: vec2,
	bornCount: number
) => {index: number; flipVertical: boolean}

export type PatternGenerator = Generator<
	MovePattern | {move: MovePattern; tileInfoGenerator: TileInfoGenerator},
	void,
	void
>

/**
 * タイルの状態や、シェーダー用のマップテクスチャを管理する
 */
export class TileMap {
	readonly width: number
	readonly height: number
	readonly numberOfVideos: number

	/** タイル情報を格納したテクスチャのデータ。赤にindex, 緑にその他の情報を格納 */
	#pixels: Uint8Array

	#patternGenerator: PatternGenerator | null = null
	#currentPattern: MovePattern | null = null
	#nextPattern: MovePattern | null = null
	#generateTileInfo: TileMapOptions['generateTileInfo']
	#step = 0
	#totalBornCount = 0

	/** 各タイルのビデオインデックス */
	#tileInfo: Array2D<{index: number; flipVertical: boolean}>

	constructor(readonly options: TileMapOptions) {
		this.width = options.width
		this.height = options.height
		this.numberOfVideos = options.numberOfVideos
		this.#generateTileInfo =
			options.generateTileInfo ??
			(() => {
				return {
					index: randomInt(0, this.numberOfVideos - 1),
					flipVertical: false,
				}
			})

		this.#pixels = new Uint8Array(this.width * this.height * 3)
		this.#tileInfo = new Array2D({
			width: this.width,
			height: this.height,
			initialize: () => this.#generateTileInfo!(0, vec2.zero, 0),
		})
	}

	/**
	 * The tile states packed as RGB pixels, ready to become the shader's map
	 * texture. The renderer owns the GPU side; this class only fills the
	 * buffer, which is reused — copy (or upload) before the next step.
	 */
	get pixels(): Uint8Array {
		return this.#pixels
	}

	/** The interpolated pattern governing the current 8-frame step */
	get currentPattern(): MovePattern | null {
		return this.#currentPattern
	}

	/** Tile info at the given cell (coordinates are wrapped toroidally) */
	getTileInfo(x: number, y: number): {index: number; flipVertical: boolean} {
		return this.#tileInfo.get(x, y)
	}

	setMovePattern(patternGeneratorFn: () => PatternGenerator) {
		this.#patternGenerator = patternGeneratorFn()

		// ジェネレーターから最初の2つのパターンを取得してキャッシュ
		const firstResult = this.#patternGenerator.next()
		const secondResult = this.#patternGenerator.next()

		if (firstResult.done || secondResult.done) {
			throw new Error('Pattern generator must yield at least 2 patterns')
		}

		this.#currentPattern =
			firstResult.value instanceof MovePattern
				? firstResult.value
				: firstResult.value.move
		this.#nextPattern =
			secondResult.value instanceof MovePattern
				? secondResult.value
				: secondResult.value.move

		// 初期状態は遷移パターン (0-1) から開始
		this.#currentPattern = interpolateMovePattens(
			firstResult.value instanceof MovePattern
				? firstResult.value
				: firstResult.value.move,
			secondResult.value instanceof MovePattern
				? secondResult.value
				: secondResult.value.move
		)

		this.#updatePixels()
	}

	/**
	 * タイル上のビデオインデックスを更新する
	 * ステップ: 0-1, 1-2, 2-3, 3-4, ...
	 */
	nextStep() {
		if (!this.#patternGenerator || !this.#nextPattern) return

		const patternGeneratorResult = this.#patternGenerator.next()
		let nextPattern: MovePattern | undefined
		if (patternGeneratorResult.value instanceof Array2D) {
			nextPattern = patternGeneratorResult.value
		} else if (patternGeneratorResult.value) {
			nextPattern = patternGeneratorResult.value.move
			this.#generateTileInfo = patternGeneratorResult.value.tileInfoGenerator
		} else {
			return
		}

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

				if (nextPattern.get(x, y).out !== Direction.None) {
					// どこからも流入しておらず、かつ次の手で流出する方向があるということは、新たに誕生する
					return this.#generateTileInfo!(
						this.#step,
						[x, y],
						this.#totalBornCount++
					)
				} else {
					// 流入もせず、流出もしないので、現状をそのまま帰す
					return tileInfo.get(x, y)
				}
			})
		}

		this.#step += 1

		if (patternGeneratorResult.done) {
			return
		}

		this.#currentPattern = interpolateMovePattens(
			this.#nextPattern,
			nextPattern
		)

		this.#nextPattern = nextPattern

		this.#updatePixels()
	}

	// タイル状態をピクセルバッファへ書き出す（GPU への転送はレンダラーの仕事）
	#updatePixels() {
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
	}
}
