import {scalar} from 'linearly'

export type Array2DConstructorOptions<T> =
	| {
			width: number
			height: number
			initialValue: T
	  }
	| {
			array: T[][]
	  }
	| {
			width: number
			height: number
			initialize: (x: number, y: number) => T
	  }

export class Array2D<T> {
	readonly width!: number
	readonly height!: number
	readonly data: T[][]

	constructor(options: Array2DConstructorOptions<T>) {
		if ('array' in options) {
			this.width = options.array[0]!.length
			this.height = options.array.length

			// 配列のサイズが不正な場合はエラー
			if (options.array.some(row => row.length !== this.width)) {
				throw new Error('Array2D: Array size is not consistent')
			}
		} else if ('width' in options) {
			this.width = options.width
			this.height = options.height
		}

		let initializer: (x: number, y: number) => T

		if ('initialValue' in options) {
			initializer = () => options.initialValue
		} else if ('array' in options) {
			initializer = (x, y) => options.array[y]![x]!
		} else {
			initializer = options.initialize
		}

		this.data = Array.from({length: this.height}, (_, y) =>
			Array.from({length: this.width}, (_, x) => initializer(x, y))
		)
	}

	/**
	 * 値を取得。座標はモジュロ演算される。
	 */
	get(x: number, y: number): T {
		const _x = scalar.mod(x, this.width)
		const _y = scalar.mod(y, this.height)
		return this.data[_y]![_x]!
	}

	set(x: number, y: number, value: T) {
		const _x = scalar.mod(x, this.width)
		const _y = scalar.mod(y, this.height)
		this.data[_y]![_x] = value
	}

	iterate(callback: (x: number, y: number, value: T) => void) {
		for (let y = 0; y < this.height; y++) {
			for (let x = 0; x < this.width; x++) {
				callback(x, y, this.get(x, y))
			}
		}
	}

	map<U>(
		callback: (x: number, y: number, value: T, array: Array2D<T>) => U
	): Array2D<U> {
		return new Array2D({
			width: this.width,
			height: this.height,
			initialize: (x, y) => callback(x, y, this.get(x, y), this),
		})
	}

	clone(): Array2D<T> {
		return new Array2D({
			width: this.width,
			height: this.height,
			initialize: (x, y) => this.get(x, y),
		})
	}
}
