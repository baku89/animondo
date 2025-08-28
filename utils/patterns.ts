import {vec2} from 'linearly'
import {Direction, invertDirection, MovePattern} from './tile'

export const size = {width: 64, height: 64}

export const right = new MovePattern({
	...size,
	initialize: (x, y) => {
		return {in: Direction.Left, out: Direction.Right}
	},
})

export const circle = new MovePattern({
	...size,
	initialize: (ox, oy) => {
		const [x, y] = vec2.sub([ox, oy], [size.width / 2, size.height / 2])

		let isLeftBottom: boolean
		let isRightBottom: boolean

		let out = Direction.None

		isLeftBottom = x < y || (x >= 0 && x === y)
		isRightBottom = x >= -y || (x >= 0 && x + 1 === -y)

		if (isLeftBottom) {
			out = isRightBottom ? Direction.Left : Direction.Up
		} else {
			out = isRightBottom ? Direction.Down : Direction.Right
		}

		isLeftBottom = x < y || (x < 0 && x === y)
		isRightBottom = x >= -y || (x < 0 && x + 1 === -y)

		let _in = Direction.None

		if (isLeftBottom) {
			_in = isRightBottom ? Direction.Right : Direction.Down
		} else {
			_in = isRightBottom ? Direction.Up : Direction.Left
		}

		if (x === y) {
			;[_in, out] = [invertDirection(out), invertDirection(_in)]
		}

		return {in: _in, out}
	},
})

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
