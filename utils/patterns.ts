import {vec2} from 'linearly'

import {Array2D} from './Array2D'
import {Direction, type Move} from './tile'
import type {PatternGenerator} from './TileMap'

// パターンを表すクラス
export type MovePattern = Array2D<Move>
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
		console.log(x, y)
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

	return pattern.map((ox, oy, m) => {
		const [x, y] = vec2.sub([ox, oy], origin)

		const l1Dist = Math.max(Math.abs(x), Math.abs(y))

		return l1Dist <= radius ? m : move(Direction.None, Direction.None)
	})
}

export const horizontalGather = new Array2D<Move>({
	...size,
	initialize(ox, oy) {
		let [x, y] = vec2.sub([ox, oy], [size.width / 2, size.height / 2])
		if (x >= 0) x += 1
		if (y >= 0) y += 1

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

export const gather = new Array2D<Move>({
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
	// return m

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
	initialize: (x, y) => {
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
	initialize: (x, y) => {
		return {in: Direction.Up, out: Direction.Down}
	},
})

export const up = invert(down)

export const right = new Array2D<Move>({
	...size,
	initialize: (x, y) => {
		return {in: Direction.Left, out: Direction.Right}
	},
})

export const left = invert(right)

export const empty = new Array2D<Move>({
	...size,
	initialize: (x, y) => {
		return {in: Direction.None, out: Direction.None}
	},
})
