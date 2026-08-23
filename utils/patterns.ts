import {vec2} from 'linearly'

import {Array2D} from './Array2D'
import {Direction, type Move} from './tile'
import type {PatternGenerator} from './TileMap'

// パターンを表すクラス
// Type + value companion: TileMap needs `instanceof MovePattern` to tell a
// bare pattern from a {move, tileInfoGenerator} yield. TS keeps type and
// value in separate declaration spaces, but ESLint's no-redeclare does not.
export type MovePattern = Array2D<Move>
// eslint-disable-next-line no-redeclare
export const MovePattern = Array2D

function move(_in: Direction, out: Direction): Move {
	return {in: _in, out}
}

export function invert(pattern: Array2D<Move>): Array2D<Move> {
	return pattern.map((x, y, move) => ({
		in: move.out,
		out: move.in,
	}))
}

export function offset(pattern: Array2D<Move>, offset: vec2): Array2D<Move> {
	return pattern.map((ox, oy) => {
		const [x, y] = vec2.sub([ox, oy], offset)
		return pattern.get(x, y)
	})
}

export function offsetGenerators(_offset: vec2, fn: () => PatternGenerator) {
	return function* () {
		const generator = fn()
		for (const result of generator) {
			if (result instanceof Array2D) {
				yield offset(result, _offset)
			} else {
				yield {
					move: offset(result.move, _offset),
					tileInfoGenerator: result.tileInfoGenerator,
				}
			}
		}
	}
}

const DELTA: Partial<Record<Direction, [number, number]>> = {
	[Direction.Up]: [0, -1],
	[Direction.Right]: [1, 0],
	[Direction.Down]: [0, 1],
	[Direction.Left]: [-1, 0],
}

/**
 * Turn every unmet flow into an appear or a vanish. A cell's `in` is only
 * real when the neighbour it points at actually sends a dancer this way,
 * and its `out` only when the receiving neighbour expects one. Anywhere
 * that link is broken — the toroidal seam of a centre-anchored pattern,
 * the rim of a radialMask — the dancer would otherwise pop in or out
 * mid-stride with no drawing to explain it; sealed, it plays its appear
 * or vanish instead. Fully consistent patterns pass through unchanged.
 */
export function seal(pattern: Array2D<Move>): Array2D<Move> {
	return pattern.map((x, y, m) => {
		let {in: inDir, out} = m

		const feederDelta = DELTA[inDir]
		if (feederDelta) {
			const feeder = pattern.get(x + feederDelta[0], y + feederDelta[1])
			if (feeder.out !== invertDirection(inDir)) inDir = Direction.None
		}

		const receiverDelta = DELTA[out]
		if (receiverDelta) {
			const receiver = pattern.get(x + receiverDelta[0], y + receiverDelta[1])
			if (receiver.in !== invertDirection(out)) out = Direction.None
		}

		return {in: inDir, out}
	})
}

function rotate90Direction(direction: Direction): Direction {
	switch (direction) {
		case Direction.None:
			return Direction.None
		case Direction.Up:
			return Direction.Left
		case Direction.Right:
			return Direction.Up
		case Direction.Down:
			return Direction.Right
		case Direction.Left:
			return Direction.Down
	}
}

function rotate90Move(move: Move): Move {
	return {
		in: rotate90Direction(move.in),
		out: rotate90Direction(move.out),
	}
}

export function rotate90(pattern: Array2D<Move>): Array2D<Move> {
	return pattern.map((ox, oy) => {
		const [x, y] = vec2.rotate90([ox, oy], true, [
			size.width / 2 - 0.5,
			size.height / 2 - 0.5,
		])
		return rotate90Move(pattern.get(x, y))
	})
}

export const size = {width: 16, height: 16}
export const width = size.width
export const height = size.height

export const clockwise = new Array2D<Move>({
	...size,
	initialize: (ox, oy) => {
		const [x, y] = vec2.sub([ox, oy], [size.width / 2, size.height / 2])

		if (x === y) {
			return 0 <= x
				? move(Direction.Up, Direction.Left)
				: move(Direction.Down, Direction.Right)
		} else if (x + 1 === -y) {
			return 0 <= x
				? move(Direction.Left, Direction.Down)
				: move(Direction.Right, Direction.Up)
		}

		if (Math.abs(x) <= y) {
			return move(Direction.Right, Direction.Left)
		} else if (Math.abs(y) <= x) {
			return move(Direction.Up, Direction.Down)
		}

		if (y > x) {
			return move(Direction.Down, Direction.Up)
		} else {
			return move(Direction.Left, Direction.Right)
		}
	},
})

export const counterClockwise = invert(clockwise)

export function radialMask(
	pattern: Array2D<Move>,
	radius: number
): Array2D<Move> {
	const origin: vec2 = [size.width / 2 - 0.5, size.height / 2 - 0.5]

	// Sealed, so flows the mask cuts appear/vanish at its rim instead of
	// being chopped mid-stride
	return seal(
		pattern.map((ox, oy, m) => {
			const [x, y] = vec2.sub([ox, oy], origin)

			const l1Dist = Math.max(Math.abs(x), Math.abs(y))

			return l1Dist <= radius ? m : move(Direction.None, Direction.None)
		})
	)
}

// Sealed: the outermost columns face each other across the toroidal seam
// with no flow actually crossing it, so dancers are born there instead of
// ghost-walking in from the far side.
export const horizontalGather = seal(
	new Array2D<Move>({
		...size,
		initialize(ox) {
			// Horizontal only, so the row plays no part — verticalGather is this
			// pattern rotated 90°.
			let x = ox - size.width / 2
			if (x >= 0) x += 1

			if (Math.abs(x) <= 1) {
				return x > 0
					? move(Direction.Right, Direction.None)
					: move(Direction.Left, Direction.None)
			}
			return x > 0
				? move(Direction.Right, Direction.Left)
				: move(Direction.Left, Direction.Right)
		},
	})
)

// Sealed for the same reason as horizontalGather: the outer rim's feeders
// sit across the toroidal seam, where nothing actually comes from.
export const gather = seal(
	new Array2D<Move>({
		...size,
		initialize(ox, oy) {
			let [x, y] = vec2.sub([ox, oy], [size.width / 2, size.height / 2])
			if (x >= 0) x += 1
			if (y >= 0) y += 1

			const isRightBottom = x > 0 ? x > -y : x >= -y
			const isLeftBottom = y > 0 ? y > x : y >= x

			let inDir: Direction
			if (isRightBottom) {
				inDir = isLeftBottom ? Direction.Down : Direction.Right
			} else {
				inDir = isLeftBottom ? Direction.Left : Direction.Up
			}

			return move(inDir, Direction.None)
		},
	}).map((x, y, m, pattern) => {
		let neighbour: Direction

		switch (m.in) {
			case Direction.None:
				return m
			case Direction.Up:
				neighbour = pattern.get(x, y + 1).in
				break
			case Direction.Right:
				neighbour = pattern.get(x - 1, y).in
				break
			case Direction.Down:
				neighbour = pattern.get(x, y - 1).in
				break
			case Direction.Left:
				neighbour = pattern.get(x + 1, y).in
				break
		}

		return neighbour === m.in
			? move(m.in, invertDirection(m.in))
			: move(m.in, Direction.None)
	})
)

export const scatter = invert(gather)

export const verticalGather = rotate90(horizontalGather)

export const horizontalScatter = invert(horizontalGather)
export const verticalScatter = invert(verticalGather)

export const verticalSwap = new Array2D<Move>({
	...size,
	initialize(x, y) {
		if (x % 2 === 0) {
			y += 1
		}

		return y % 2 === 0
			? move(Direction.Down, Direction.Down)
			: move(Direction.Up, Direction.Up)
	},
})

export const horizontalSwap = rotate90(verticalSwap)

export const smallClockwise = new Array2D<Move>({
	...size,
	initialize(x, y) {
		x = x % 2
		y = y % 2

		if (x === 0 && y === 0) {
			return move(Direction.Down, Direction.Right)
		} else if (x === 1 && y === 0) {
			return move(Direction.Left, Direction.Down)
		} else if (x === 1 && y === 1) {
			return move(Direction.Up, Direction.Left)
		}
		return move(Direction.Right, Direction.Up)
	},
})

/**
 * Higher-order shuffle, ported from chigyo-vj: repeatedly pick a 2x2 block
 * and, where two links cross it in opposite directions, reconnect them so
 * the flow changes lanes. Each rewiring keeps every flow met by its
 * receiving cell (the extra inequality guards stop two cells from closing
 * into a bouncing pair), so a consistent pattern stays consistent and no
 * birth or death is ever added or lost. A fresh roll on every call. Seed
 * it with something rich in passing lanes — upDown, smallClockwise, the
 * gathers — or there is little to reconnect.
 */
export function shuffle(
	pattern: Array2D<Move>,
	iterations = 1000
): Array2D<Move> {
	const newPattern = pattern.clone()

	for (let i = 0; i < iterations; i++) {
		const x = randomInt(0, pattern.width - 1)
		const y = randomInt(0, pattern.height - 1)
		swap([x, y])
	}

	return newPattern

	function swap([x, y]: vec2) {
		const tl = newPattern.get(x, y)
		const tr = newPattern.get(x + 1, y)
		const bl = newPattern.get(x, y + 1)
		const br = newPattern.get(x + 1, y + 1)

		if (
			tl.in === Direction.Right &&
			tr.in !== Direction.Down &&
			tl.out !== Direction.Down &&
			bl.out === Direction.Right
		) {
			newPattern.set(x, y, {in: Direction.Down, out: tl.out})
			newPattern.set(x + 1, y, {in: tr.in, out: Direction.Down})
			newPattern.set(x, y + 1, {in: bl.in, out: Direction.Up})
			newPattern.set(x + 1, y + 1, {in: Direction.Up, out: br.out})
		} else if (
			tl.in !== Direction.Down &&
			tl.out === Direction.Right &&
			tr.out !== Direction.Down &&
			bl.in === Direction.Right
		) {
			newPattern.set(x, y, {in: tl.in, out: Direction.Down})
			newPattern.set(x + 1, y, {in: Direction.Down, out: tr.out})
			newPattern.set(x, y + 1, {in: Direction.Up, out: bl.out})
			newPattern.set(x + 1, y + 1, {in: br.in, out: Direction.Up})
		} else if (
			tl.in !== Direction.Right &&
			tl.out === Direction.Down &&
			tr.in === Direction.Down &&
			bl.out !== Direction.Right
		) {
			newPattern.set(x, y, {in: tl.in, out: Direction.Right})
			newPattern.set(x + 1, y, {in: Direction.Left, out: tr.out})
			newPattern.set(x, y + 1, {in: Direction.Right, out: bl.out})
			newPattern.set(x + 1, y + 1, {in: br.in, out: Direction.Left})
		} else if (
			tl.in === Direction.Down &&
			tl.out !== Direction.Right &&
			tr.out === Direction.Down &&
			bl.in !== Direction.Right
		) {
			newPattern.set(x, y, {in: Direction.Right, out: tl.out})
			newPattern.set(x + 1, y, {in: tr.in, out: Direction.Left})
			newPattern.set(x, y + 1, {in: bl.in, out: Direction.Right})
			newPattern.set(x + 1, y + 1, {in: Direction.Left, out: br.out})
		}
	}
}

export const rightAppearVanish = new Array2D<Move>({
	...size,
	initialize(x, y) {
		x += y % 4
		x %= 4

		if (x === 0) {
			return move(Direction.None, Direction.Right)
		} else if (x === 3) {
			return move(Direction.Left, Direction.None)
		}
		return move(Direction.Left, Direction.Right)
	},
})

export const upDown = new Array2D<Move>({
	...size,
	initialize: x => {
		if (x % 2 === 0) {
			return {in: Direction.Down, out: Direction.Up}
		}
		return {in: Direction.Up, out: Direction.Down}
	},
})

export const downUp = invert(upDown)

export const leftRight = new Array2D<Move>({
	...size,
	initialize: (x, y) => {
		if (y % 2 === 0) {
			return {in: Direction.Right, out: Direction.Left}
		}
		return {in: Direction.Left, out: Direction.Right}
	},
})

export const rightLeft = invert(leftRight)

export const down = new Array2D<Move>({
	...size,
	initialize: () => {
		return {in: Direction.Up, out: Direction.Down}
	},
})

export const up = invert(down)

export const right = new Array2D<Move>({
	...size,
	initialize: () => {
		return {in: Direction.Left, out: Direction.Right}
	},
})

export const left = invert(right)

export const empty = new Array2D<Move>({
	...size,
	initialize: () => {
		return {in: Direction.None, out: Direction.None}
	},
})
