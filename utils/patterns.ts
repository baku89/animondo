import {vec2} from 'linearly'
import {Direction, MovePattern, type Move} from './tile'

const _ = Direction.None
const U = Direction.Up
const R = Direction.Right
const D = Direction.Down
const L = Direction.Left

function move(_in: Direction, out: Direction): Move {
	return {in: _in, out}
}

export const size = {width: 16, height: 16}

export const right = new MovePattern({
	...size,
	initialize: (x, y) => {
		return {in: Direction.Left, out: Direction.Right}
	},
})

export const clockwise = new MovePattern({
	...size,
	initialize: (ox, oy) => {
		const [x, y] = vec2.sub([ox, oy], [size.width / 2, size.height / 2])

		if (x === y) {
			return 0 <= x ? move(U, L) : move(D, R)
		} else if (x + 1 === -y) {
			return 0 <= x ? move(L, D) : move(R, U)
		}

		if (Math.abs(x) <= y) {
			return move(R, L)
		} else if (Math.abs(y) <= x) {
			return move(U, D)
		}

		if (y > x) {
			return move(D, U)
		} else {
			return move(L, R)
		}
	},
})

export function radialMask(pattern: MovePattern, radius: number) {
	const origin: vec2 = [size.width / 2 - 0.5, size.height / 2 - 0.5]

	return pattern.map((ox, oy, m) => {
		const [x, y] = vec2.sub([ox, oy], origin)

		const l1Dist = Math.max(Math.abs(x), Math.abs(y))

		return l1Dist <= radius ? m : move(_, _)
	})
}

export const down = new MovePattern({
	...size,
	initialize: (x, y) => {
		return {in: Direction.Up, out: Direction.Down}
	},
})

export const upDown = new MovePattern({
	...size,
	initialize: (x, y) => {
		if (x % 2 === 0) {
			return {in: Direction.Down, out: Direction.Up}
		}
		return {in: Direction.Up, out: Direction.Down}
	},
})

export const leftRight = new MovePattern({
	...size,
	initialize: (x, y) => {
		if (y % 2 === 0) {
			return {in: Direction.Right, out: Direction.Left}
		}
		return {in: Direction.Left, out: Direction.Right}
	},
})
