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

// prettier-ignore
const NEIGHBOURS_8: readonly [number, number][] = [
	[-1, -1], [0, -1], [1, -1],
	[-1, 0], [1, 0],
	[-1, 1], [0, 1], [1, 1],
]

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
		// When unset, births go through #pickBirthIndex (balanced and
		// neighbour-aware) instead of a plain random draw
		this.#generateTileInfo = options.generateTileInfo

		this.#pixels = new Uint8Array(this.width * this.height * 3)

		// The initial fill is what the very FIRST births show — the opening
		// bridge reads it before any step runs — so it obeys the same rules
		// as later births and then some: even counts, and no two alike
		// touching even diagonally, toroidal seams included. Diagonals
		// matter here because the opening's first ring is this fill's
		// centre 2x2 — a diagonal twin put two of the same dancer among
		// the first four on stage.
		if (this.#generateTileInfo) {
			this.#tileInfo = new Array2D({
				width: this.width,
				height: this.height,
				initialize: () => this.#generateTileInfo!(0, vec2.zero, 0),
			})
		} else {
			const counts = new Array<number>(this.numberOfVideos).fill(0)
			const filled: number[] = []
			for (let y = 0; y < this.height; y++) {
				for (let x = 0; x < this.width; x++) {
					// Every already-placed toroidal neighbour, diagonals
					// included (cells not yet dealt simply aren't in `filled`)
					const beside = new Set<number>()
					for (const [dx, dy] of NEIGHBOURS_8) {
						const nx = (x + dx + this.width) % this.width
						const ny = (y + dy + this.height) % this.height
						const already = filled[ny * this.width + nx]
						if (already !== undefined) beside.add(already)
					}
					const index = this.#choose(counts, beside)
					counts[index]!++
					filled.push(index)
				}
			}
			this.#tileInfo = new Array2D({
				width: this.width,
				height: this.height,
				initialize: (x, y) => ({
					index: filled[y * this.width + x]!,
					flipVertical: false,
				}),
			})
		}
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
			// The on-screen population per artist, and the identities already
			// settled this step (in iteration order) — births read both, so a
			// newcomer fills the thinnest ranks and avoids standing beside its
			// own kind, same-step newcomers included.
			const counts = new Array<number>(this.numberOfVideos).fill(0)
			previousPattern.iterate((x, y, move) => {
				if (move.in !== Direction.None || move.out !== Direction.None) {
					counts[this.#tileInfo.get(x, y).index]!++
				}
			})
			const decided = new Map<number, number>()

			this.#tileInfo = this.#tileInfo.map((x, y, _, tileInfo) => {
				const settle = (info: {index: number; flipVertical: boolean}) => {
					decided.set(y * this.width + x, info.index)
					return info
				}

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
						return settle({
							...info,
							flipVertical: !info.flipVertical,
						})
					}
					return settle(info)
				}

				if (nextPattern.get(x, y).out !== Direction.None) {
					// どこからも流入しておらず、かつ次の手で流出する方向があるということは、新たに誕生する
					if (this.#generateTileInfo) {
						return settle(
							this.#generateTileInfo(this.#step, [x, y], this.#totalBornCount++)
						)
					}
					this.#totalBornCount++
					const index = this.#pickBirthIndex(x, y, nextPattern, counts, decided)
					counts[index]!++
					return settle({index, flipVertical: false})
				} else {
					// 流入もせず、流出もしないので、現状をそのまま帰す
					return settle(tileInfo.get(x, y))
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

	// A newcomer's identity: never the same as a dancer it would stand next
	// to (toroidal 4-neighbours that keep dancing next turn — freshly born
	// ones included, via `decided`), and among what remains, whoever has the
	// fewest dancers on the floor, so the troupe stays evenly mixed. Ties
	// break randomly; an over-constrained corner falls back to the full cast.
	#pickBirthIndex(
		x: number,
		y: number,
		nextPattern: MovePattern,
		counts: number[],
		decided: Map<number, number>
	): number {
		const beside = new Set<number>()
		for (const [dx, dy] of [
			[-1, 0],
			[1, 0],
			[0, -1],
			[0, 1],
		] as const) {
			const nx = (x + dx + this.width) % this.width
			const ny = (y + dy + this.height) % this.height
			// A neighbour with no move next turn is leaving or empty — its
			// stale identity should not constrain anything
			if (nextPattern.get(nx, ny).out === Direction.None) continue
			beside.add(
				decided.get(ny * this.width + nx) ?? this.#tileInfo.get(nx, ny).index
			)
		}
		return this.#choose(counts, beside)
	}

	// The least-populated artist not standing right beside; ties break
	// randomly, and an over-constrained spot falls back to the full cast
	#choose(counts: number[], beside: Set<number>): number {
		const avoid = beside.size < this.numberOfVideos ? beside : new Set<number>()

		let pool: number[] = []
		let fewest = Infinity
		for (let index = 0; index < this.numberOfVideos; index++) {
			if (avoid.has(index)) continue
			const count = counts[index]!
			if (count < fewest) {
				fewest = count
				pool = [index]
			} else if (count === fewest) {
				pool.push(index)
			}
		}
		return pool[randomInt(0, pool.length - 1)]!
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
