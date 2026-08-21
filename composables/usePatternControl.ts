import {useEventListener} from '@vueuse/core'
import type {vec2} from 'linearly'

import type {MovePattern} from '~/utils/patterns'
import * as Patterns from '~/utils/patterns'

interface Binding {
	pattern: MovePattern
	/** Built around the middle of the grid, so it has to follow the camera */
	centred?: boolean
}

// One key per family: its dual is reached by pressing the same key again,
// which is why counterClockwise, scatter and the rest are absent here.
const BINDINGS: Record<string, Binding> = {
	c: {pattern: Patterns.clockwise, centred: true},
	a: {pattern: Patterns.gather, centred: true},
	h: {pattern: Patterns.horizontalGather, centred: true},
	v: {pattern: Patterns.verticalGather, centred: true},
	q: {pattern: Patterns.smallClockwise},
	w: {pattern: Patterns.rightAppearVanish},
	s: {pattern: Patterns.verticalSwap},
	x: {pattern: Patterns.horizontalSwap},
	u: {pattern: Patterns.upDown},
	l: {pattern: Patterns.leftRight},
	arrowup: {pattern: Patterns.up},
	arrowright: {pattern: Patterns.right},
	arrowdown: {pattern: Patterns.down},
	arrowleft: {pattern: Patterns.left},
	' ': {pattern: Patterns.empty},
}

export function usePatternControl(centreCell: () => vec2) {
	// What has been asked for, waiting for the next step to pick it up
	let pendingKey = 'c'
	let inverted = false

	useEventListener('keydown', (event: KeyboardEvent) => {
		if (event.metaKey || event.ctrlKey || event.altKey) return

		const key = event.key.toLowerCase()
		if (!(key in BINDINGS)) return
		event.preventDefault()

		// Pressing the same key again flips the pattern rather than restating
		// it, so every family reaches its dual from one key: clockwise turns
		// counter-clockwise, gather becomes scatter.
		if (key === pendingKey) {
			inverted = !inverted
		} else {
			pendingKey = key
			inverted = false
		}
	})

	// Read once per automaton step. Presses are never acted on as they arrive,
	// which quantises them to the beat and collapses a flurry inside one step
	// down to whatever it ended on.
	function takePattern(): MovePattern {
		const binding = BINDINGS[pendingKey]!
		const pattern = inverted
			? Patterns.invert(binding.pattern)
			: binding.pattern

		if (!binding.centred) return pattern

		// These are drawn around the middle of the grid, so without this the
		// vortex sits wherever the visitor last panned away from.
		const [cx, cy] = centreCell()
		return Patterns.offset(pattern, [
			Math.round(cx - Patterns.size.width / 2),
			Math.round(cy - Patterns.size.height / 2),
		])
	}

	return {takePattern}
}
