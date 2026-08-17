import {marked} from 'marked'

import type {Locale} from '~/composables/useI18n'

export interface ArtistInfo {
	id: string
	name: Record<Locale, string>
	url: Record<Locale, string>
	/** Rendered markdown — injected with v-html, so keep the source trusted. */
	profileHtml: Record<Locale, string>
}

// Video index order: public/sprites/{id}.mp4 is loaded in this order, and the
// tile map stores the resulting index per cell. Laura and Lucija may rejoin
// later — add them here (with their .md files) and the sprite list follows,
// but the shader also needs matching video8/video9 uniforms.
const ARTIST_IDS = [
	'noemie',
	'baku',
	'sumito',
	'masa',
	'edmunds',
	'honami',
	'shinobu',
	'sander',
]

// content/artists/{id}.{locale}.md — frontmatter carries the name and site
// URL, the body is the profile. Bundled at build time, so a missing or
// malformed file throws as soon as the module loads.
const sources = import.meta.glob('../content/artists/*.md', {
	eager: true,
	query: '?raw',
	import: 'default',
}) as Record<string, string>

interface ArtistDoc {
	name: string
	url: string
	profileHtml: string
}

// Profiles are read inside a running artwork, so a link must not navigate the
// page away and tear down the animation and audio.
marked.use({
	renderer: {
		link({href, title, tokens}) {
			const label = this.parser.parseInline(tokens)
			const titleAttr = title ? ` title="${title}"` : ''
			return `<a href="${href}"${titleAttr} target="_blank" rel="noopener">${label}</a>`
		},
	},
})

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

// Soft wraps inside a paragraph are a source-formatting choice, not content.
// Latin text needs a space back where the line broke; Japanese must not get
// one, or the bubble renders a gap mid-sentence. Markdown itself keeps the
// break, and HTML would collapse it to a space, so this has to happen before
// the source reaches the renderer.
const CJK =
	/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\u3000-\u303f\uff00-\uffef]/u

// A line opening a markdown block stays on its own line \u2014 folding these into
// the line above would turn a list into one run-on paragraph. A line that does
// NOT open a block still joins upward, which is markdown's lazy continuation
// and keeps wrapped list items tight.
const BLOCK_START = /^(?:[-*+>#|]|\d+[.)]|```|~~~)/

function unwrapSoftBreaks(block: string): string {
	const lines: string[] = []

	for (const rawLine of block.split(/\r?\n/)) {
		const line = rawLine.trim()
		if (!line) continue

		const previous = lines.at(-1)
		if (previous === undefined || BLOCK_START.test(line)) {
			lines.push(line)
			continue
		}

		const glue = CJK.test(previous.slice(-1)) || CJK.test(line[0]) ? '' : ' '
		lines[lines.length - 1] = previous + glue + line
	}

	return lines.join('\n')
}

function parseDoc(source: string, path: string): ArtistDoc {
	const matched = FRONTMATTER.exec(source)
	if (!matched) {
		throw new Error(`${path}: missing --- frontmatter ---`)
	}

	const fields: Record<string, string> = {}
	for (const rawLine of matched[1].split(/\r?\n/)) {
		const line = rawLine.trim()
		if (!line || line.startsWith('#')) continue

		const colon = line.indexOf(':')
		if (colon < 0) {
			throw new Error(`${path}: expected "key: value" in frontmatter, got "${line}"`)
		}
		fields[line.slice(0, colon).trim()] = line.slice(colon + 1).trim()
	}

	const {name, url} = fields
	if (!name) throw new Error(`${path}: frontmatter is missing "name"`)
	if (!url) throw new Error(`${path}: frontmatter is missing "url"`)

	const body = source
		.slice(matched[0].length)
		.split(/\r?\n\s*\r?\n/)
		.map(unwrapSoftBreaks)
		.filter(Boolean)
		.join('\n\n')

	if (!body) throw new Error(`${path}: profile body is empty`)

	return {name, url, profileHtml: marked.parse(body, {async: false})}
}

function readDoc(id: string, locale: Locale): ArtistDoc {
	const path = `../content/artists/${id}.${locale}.md`
	const source = sources[path]
	if (source === undefined) {
		throw new Error(`Missing content/artists/${id}.${locale}.md`)
	}
	return parseDoc(source, path)
}

export const ARTISTS: ArtistInfo[] = ARTIST_IDS.map(id => {
	const en = readDoc(id, 'en')
	const ja = readDoc(id, 'ja')

	return {
		id,
		name: {en: en.name, ja: ja.name},
		url: {en: en.url, ja: ja.url},
		profileHtml: {en: en.profileHtml, ja: ja.profileHtml},
	}
})
