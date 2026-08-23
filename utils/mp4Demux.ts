/**
 * A minimal MP4 demuxer, sized for exactly the files this piece ships.
 *
 * WebCodecs' VideoDecoder eats raw H.264 samples, not MP4 files, and the
 * usual answer is a 50KB demuxer dependency. But our sprites are tiny,
 * deterministic AE/ffmpeg exports — one video track, 32-bit tables, eight
 * samples — so the subset of ISO-BMFF they actually use fits in a page.
 * This throws loudly on anything it does not understand rather than guess.
 */

export interface Mp4Sample {
	offset: number
	size: number
	key: boolean
}

export interface DemuxedVideo {
	/** e.g. "avc1.640028", ready for VideoDecoder.configure */
	codec: string
	/** The avcC box payload — out-of-band SPS/PPS for the decoder */
	description: Uint8Array
	width: number
	height: number
	samples: Mp4Sample[]
}

interface Box {
	type: string
	start: number
	end: number
}

function* boxes(view: DataView, start: number, end: number): Generator<Box> {
	let offset = start
	while (offset + 8 <= end) {
		let size = view.getUint32(offset)
		const type = String.fromCharCode(
			view.getUint8(offset + 4),
			view.getUint8(offset + 5),
			view.getUint8(offset + 6),
			view.getUint8(offset + 7)
		)
		let header = 8
		if (size === 1) {
			// 64-bit size; our files stay far below 4GB but ftyp-adjacent
			// tools sometimes emit it anyway
			size = Number(view.getBigUint64(offset + 8))
			header = 16
		} else if (size === 0) {
			size = end - offset
		}
		if (size < header) throw new Error(`mp4: bad box size at ${offset}`)
		yield {type, start: offset + header, end: offset + size}
		offset += size
	}
}

function find(view: DataView, box: Box, type: string): Box | null {
	for (const child of boxes(view, box.start, box.end)) {
		if (child.type === type) return child
	}
	return null
}

function need(view: DataView, box: Box, type: string): Box {
	const found = find(view, box, type)
	if (!found) throw new Error(`mp4: missing ${type}`)
	return found
}

export function demuxMp4Video(buffer: ArrayBuffer): DemuxedVideo {
	const view = new DataView(buffer)
	const root: Box = {type: '', start: 0, end: buffer.byteLength}

	const moov = need(view, root, 'moov')

	// The sprites carry a timecode track too; take the track whose media
	// handler is video
	let stbl: Box | null = null
	for (const trak of boxes(view, moov.start, moov.end)) {
		if (trak.type !== 'trak') continue
		const mdia = find(view, trak, 'mdia')
		if (!mdia) continue
		const hdlr = need(view, mdia, 'hdlr')
		const handler = String.fromCharCode(
			view.getUint8(hdlr.start + 8),
			view.getUint8(hdlr.start + 9),
			view.getUint8(hdlr.start + 10),
			view.getUint8(hdlr.start + 11)
		)
		if (handler !== 'vide') continue
		stbl = need(view, need(view, mdia, 'minf'), 'stbl')
		break
	}
	if (!stbl) throw new Error('mp4: no video track')

	// --- stsd: codec, dimensions, decoder configuration ---
	const stsd = need(view, stbl, 'stsd')
	const entry: Box = {
		type: '',
		start: stsd.start + 8,
		end: stsd.end,
	}
	const entryType = String.fromCharCode(
		view.getUint8(entry.start + 4),
		view.getUint8(entry.start + 5),
		view.getUint8(entry.start + 6),
		view.getUint8(entry.start + 7)
	)
	if (entryType !== 'avc1') {
		throw new Error(`mp4: expected avc1, found ${entryType}`)
	}
	const width = view.getUint16(entry.start + 32)
	const height = view.getUint16(entry.start + 34)

	// Children of the visual sample entry start after its 86 fixed bytes
	const avcC = need(
		view,
		{type: '', start: entry.start + 86, end: entry.start + view.getUint32(entry.start)},
		'avcC'
	)
	const description = new Uint8Array(buffer, avcC.start, avcC.end - avcC.start)
	const codec =
		'avc1.' +
		[1, 2, 3]
			.map(i => view.getUint8(avcC.start + i).toString(16).padStart(2, '0'))
			.join('')

	// --- sample tables ---
	const stsz = need(view, stbl, 'stsz')
	const uniformSize = view.getUint32(stsz.start + 4)
	const count = view.getUint32(stsz.start + 8)
	const sizes: number[] = []
	for (let i = 0; i < count; i++) {
		sizes.push(uniformSize || view.getUint32(stsz.start + 12 + i * 4))
	}

	const stco = find(view, stbl, 'stco')
	const co64 = stco ? null : need(view, stbl, 'co64')
	const chunkBox = (stco ?? co64)!
	const chunkCount = view.getUint32(chunkBox.start + 4)
	const chunkOffsets: number[] = []
	for (let i = 0; i < chunkCount; i++) {
		chunkOffsets.push(
			stco
				? view.getUint32(chunkBox.start + 8 + i * 4)
				: Number(view.getBigUint64(chunkBox.start + 8 + i * 8))
		)
	}

	const stsc = need(view, stbl, 'stsc')
	const stscCount = view.getUint32(stsc.start + 4)
	const runs: {firstChunk: number; perChunk: number}[] = []
	for (let i = 0; i < stscCount; i++) {
		runs.push({
			firstChunk: view.getUint32(stsc.start + 8 + i * 12),
			perChunk: view.getUint32(stsc.start + 12 + i * 12),
		})
	}

	// stss lists the sync samples; when absent, every sample is one
	const stss = find(view, stbl, 'stss')
	const sync = new Set<number>()
	if (stss) {
		const syncCount = view.getUint32(stss.start + 4)
		for (let i = 0; i < syncCount; i++) {
			sync.add(view.getUint32(stss.start + 8 + i * 4) - 1)
		}
	}

	// Walk chunks, laying samples out inside each
	const samples: Mp4Sample[] = []
	for (let chunk = 0; chunk < chunkOffsets.length; chunk++) {
		let perChunk = 1
		for (const run of runs) {
			if (chunk + 1 >= run.firstChunk) perChunk = run.perChunk
		}
		let offset = chunkOffsets[chunk]!
		for (let i = 0; i < perChunk && samples.length < count; i++) {
			const size = sizes[samples.length]!
			samples.push({
				offset,
				size,
				key: stss ? sync.has(samples.length) : true,
			})
			offset += size
		}
	}
	if (samples.length !== count) {
		throw new Error(`mp4: laid out ${samples.length} of ${count} samples`)
	}

	return {codec, description, width, height, samples}
}
