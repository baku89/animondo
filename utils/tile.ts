import {Array2D} from './Array2D'

// アニメーションのタイル素材の種類
export enum Tile {
	None = 0,
	Birth = 1,
	Up = 2,
	Right = 3,
	Down = 4,
	Left = 5,
	Death = 6,
}

// 絶対向きを表す
export enum Direction {
	None = 0,
	Up = 1,
	Right = 2,
	Down = 3,
	Left = 4,
}

// どのタイルのどのパターンを、何度回転（90度刻み）で表示するか
export type TileDisplay = {
	tile: Tile
	/* 0: 0度, 1: 90度, 2: 180度, 3: 270度 */
	rotation: number
	/* タイル素材のインデックス */
	index: number
}

// どの向きから入って、度の向きから出ていくか。片方のディレクションがNoneの場合は、BirthかDeath。
// いずれもNoneの場合は、何も表示しない。
export type Move = {in: Direction; out: Direction}

// パターンを表すクラス
export class MovePattern extends Array2D<Move> {}

// moveToTileDisplayのルックアップテーブル [inDir][outDir] -> TileDisplay
// Direction enum: None=0, Up=1, Right=2, Down=3, Left=4
// rotation: 0=0°, 1=90°, 2=180°, 3=270° (素材は「左から入る」前提)
const TILE_DISPLAY_TABLE: Omit<TileDisplay, 'index'>[][] = [
	// inDir=None (0) - Birth cases
	[
		{tile: Tile.None, rotation: 0}, // None→None
		{tile: Tile.Birth, rotation: 3}, // None→Up (birth upward)
		{tile: Tile.Birth, rotation: 0}, // None→Right (birth rightward)
		{tile: Tile.Birth, rotation: 1}, // None→Down (birth downward)
		{tile: Tile.Birth, rotation: 2}, // None→Left (birth leftward)
	],
	// inDir=Up (1)
	[
		{tile: Tile.Death, rotation: 1}, // Up→None
		{tile: Tile.Left, rotation: 1}, // Up→Up
		{tile: Tile.Up, rotation: 1}, // Up→Right
		{tile: Tile.Right, rotation: 1}, // Up→Down
		{tile: Tile.Down, rotation: 1}, // Up→Left
	],
	// inDir=Right (2)
	[
		{tile: Tile.Death, rotation: 2}, // Right→None
		{tile: Tile.Down, rotation: 2}, // Right→Up
		{tile: Tile.Left, rotation: 2}, // Right→Right
		{tile: Tile.Up, rotation: 2}, // Right→Down
		{tile: Tile.Right, rotation: 2}, // Right→Left
	],
	// inDir=Down (3)
	[
		{tile: Tile.Death, rotation: 3}, // Down→None
		{tile: Tile.Right, rotation: 3}, // Down→Up
		{tile: Tile.Down, rotation: 3}, // Down→Right
		{tile: Tile.Left, rotation: 3}, // Down→Down
		{tile: Tile.Up, rotation: 3}, // Down→Left
	],
	// inDir=Left (4)
	[
		{tile: Tile.Death, rotation: 0}, // Left→None
		{tile: Tile.Up, rotation: 0}, // Left→Up
		{tile: Tile.Right, rotation: 0}, // Left→Right
		{tile: Tile.Down, rotation: 0}, // Left→Down
		{tile: Tile.Left, rotation: 0}, // Left→Left
	],
]

export function invertMovePattern(movePattern: MovePattern) {
	return movePattern.map((x, y, move) => ({
		in: move.out,
		out: move.in,
	}))
}

export function moveToTileDisplay(move: Move, index: number = 0): TileDisplay {
	const baseTileDisplay = TILE_DISPLAY_TABLE[move.in]?.[move.out] ?? {
		tile: Tile.None,
		rotation: 0,
	}
	return {
		...baseTileDisplay,
		index,
	}
}

// TileDisplayをUint8に変換
// Tile: 3bit (6種類)
// Rotation: 2bit (4種類)
// Index: 3bit (10種類)
// III | RR | TTT
export function tileDisplayToUint8(tileDisplay: TileDisplay): number {
	return (
		(tileDisplay.tile & 0b111) |
		((tileDisplay.rotation & 0b11) << 3) |
		((tileDisplay.index & 0b111) << 5)
	)
}

// Uint8からTileDisplayに変換
export function uint8ToTileDisplay(value: number): TileDisplay {
	return {
		tile: value & 0b111, // Bits 0-2
		rotation: (value >> 3) & 0b11, // Bits 3-4
		index: (value >> 5) & 0b111, // Bits 5-7
	}
}

// 方向を反転させる
export function invertDirection(direction: Direction): Direction {
	return direction === Direction.Up
		? Direction.Down
		: direction === Direction.Down
			? Direction.Up
			: direction === Direction.Left
				? Direction.Right
				: direction === Direction.Right
					? Direction.Left
					: Direction.None
}

// 2つのパターンがつながるようなパターンを作る
export function interpolateMovePattens(
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
