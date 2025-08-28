import type Regl from 'regl'
import {moveToTileDisplay, tileDisplayToUint8, type MovePattern} from './tile'

export class TileMap {
	#data: Uint8Array
	#texture: Regl.Texture2D

	constructor(
		readonly regl: Regl.Regl,
		readonly width: number,
		readonly height: number
	) {
		this.#data = new Uint8Array(this.width * this.height)

		this.#texture = this.regl.texture({
			width: this.width,
			height: this.height,
			format: 'luminance',
			type: 'uint8',
			mag: 'nearest',
			min: 'nearest',
			wrap: 'repeat',
		})
	}

	get texture(): Regl.Texture2D {
		return this.#texture
	}

	setMovePattern(pattern: MovePattern) {
		for (let y = 0; y < pattern.length; y++) {
			const row = pattern[y]
			if (!row) continue
			for (let x = 0; x < row.length; x++) {
				const move = row[x]

				if (move) {
					const tileDisplay = moveToTileDisplay(move)
					const index = y * this.width + x
					this.#data[index] = tileDisplayToUint8(tileDisplay)
				}
			}
		}
	}

	// テクスチャを更新（GPUに送信）
	updateTexture() {
		this.#texture.subimage(this.#data)
	}

	// 破棄
	destroy() {
		this.#texture.destroy()
	}
}
