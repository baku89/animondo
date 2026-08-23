<template>
	<div class="pattern-launchpad">
		<template v-for="(cell, i) in GRID" :key="i">
			<button
				v-if="cell"
				class="pattern-launchpad__pad"
				:class="{
					'pattern-launchpad__pad--queued': cell.id === queuedPad,
					'pattern-launchpad__pad--active': cell.id === activePad,
				}"
				:aria-label="cell.id"
				@pointerdown="$emit('tap', cell.id)"
			>
				<!-- Remounted by :key on every activation, so the flash always
					restarts even when the same pad fires twice in a row -->
				<span
					v-if="cell.id === activePad"
					:key="activationSeq"
					class="pattern-launchpad__flash"
				/>
				<span class="pattern-launchpad__label">{{ cell.label }}</span>
			</button>
			<span v-else />
		</template>
	</div>
</template>

<script setup lang="ts">
import {PADS} from '~/composables/usePatternControl'

defineProps<{
	queuedPad: string | null
	activePad: string | null
	activationSeq: number
}>()

defineEmits<{(e: 'tap', id: string): void}>()

// Stand-ins until each pad gets its own drawn icon
const LABELS: Record<string, string> = {
	clockwise: 'circle',
	gather: 'gather',
	smallClockwise: 'spin',
	axisGather: 'pinch',
	lanes: 'lanes',
	appearVanish: 'waves',
	shuffle: 'shuffle',
	up: '↑',
	right: '→',
	down: '↓',
	left: '←',
}

function pad(id: string) {
	const found = PADS.find(p => p.id === id)
	if (!found) throw new Error(`Unknown pad: ${id}`)
	return {id, label: LABELS[id] ?? id}
}

// Row-major, 3 × 4. The bottom-left cell stays empty — the ☓ button that
// closes the launchpad lives there. The arrows sit as their own 2 × 2 block,
// laid out in the turning order they flow in.
const GRID: (ReturnType<typeof pad> | null)[] = [
	pad('clockwise'),
	pad('gather'),
	pad('smallClockwise'),
	pad('axisGather'),
	pad('lanes'),
	pad('appearVanish'),
	pad('shuffle'),
	pad('up'),
	pad('right'),
	null,
	pad('down'),
	pad('left'),
]
</script>

<style lang="stylus">
.pattern-launchpad
	position fixed
	inset 0
	// Above the bubble, below the button row — the ☓ stays reachable
	z-index 90
	display grid
	grid-template-columns repeat(3, 1fr)
	grid-template-rows repeat(4, 1fr)
	// A small gutter keeps the tile borders single-width everywhere
	gap 2px
	padding 2px

	&__pad
		position relative
		display flex
		align-items center
		justify-content center
		padding 0
		background none
		// The tint must stay inside the drawn frame: the border band itself
		// is transparent outside the ink's rounded corners
		background-clip padding-box
		// The speech bubble's drawing, minus its fill — the same hand-drawn
		// frame boiling on the same clock (bubble-boil lives in index.vue)
		border 16px solid transparent
		border-image url('/animondo/bubble/frame_0.webp') 128 round
		animation bubble-boil 0.3333s steps(1) infinite
		opacity 0.45
		cursor pointer
		touch-action manipulation
		-webkit-tap-highlight-color transparent
		user-select none
		-webkit-user-select none
		transition opacity 0.2s, background-color 0.2s

		&--queued
			opacity 1
			animation bubble-boil 0.3333s steps(1) infinite, pad-pulse 0.45s ease-in-out infinite alternate

		&--active
			opacity 1
			background rgba(0, 0, 0, 0.08)
			background-clip padding-box

	&__flash
		position absolute
		inset 0
		background black
		animation pad-flash 0.5s ease-out forwards
		pointer-events none

	&__label
		position relative
		font-size 0.75rem
		pointer-events none

@keyframes pad-pulse
	from
		background-color transparent
	to
		background-color rgba(0, 0, 0, 0.15)

@keyframes pad-flash
	from
		opacity 0.85
	to
		opacity 0
</style>
