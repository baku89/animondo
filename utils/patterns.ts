import {vec2} from 'linearly'
import {Array2D} from './Array2D'
import {Direction, type Move} from './tile'

// パターンを表すクラス
export type MovePattern = Array2D<Move>
export const MovePattern = Array2D

function move(_in: Direction, out: Direction): Move {
	return {in: _in, out}
}

function invertMovePattern(pattern: Array2D<Move>): Array2D<Move> {
	return pattern.map((x, y, move) => ({
		in: move.out,
		out: move.in,
	}))
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

export const counterClockwise = invertMovePattern(clockwise)

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

export const upDown = new Array2D<Move>({
	...size,
	initialize: (x, y) => {
		if (x % 2 === 0) {
			return {in: Direction.Down, out: Direction.Up}
		}
		return {in: Direction.Up, out: Direction.Down}
	},
})

export const downUp = invertMovePattern(upDown)

export const leftRight = new Array2D<Move>({
	...size,
	initialize: (x, y) => {
		if (y % 2 === 0) {
			return {in: Direction.Right, out: Direction.Left}
		}
		return {in: Direction.Left, out: Direction.Right}
	},
})

export const rightLeft = invertMovePattern(leftRight)

export const down = new Array2D<Move>({
	...size,
	initialize: (x, y) => {
		return {in: Direction.Up, out: Direction.Down}
	},
})

export const up = invertMovePattern(down)

export const right = new Array2D<Move>({
	...size,
	initialize: (x, y) => {
		return {in: Direction.Left, out: Direction.Right}
	},
})

export const left = invertMovePattern(right)

export const empty = new Array2D<Move>({
	...size,
	initialize: (x, y) => {
		return {in: Direction.None, out: Direction.None}
	},
})
