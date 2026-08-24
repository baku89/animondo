<template>
	<!-- The title screen is plain canvas and draws anywhere, so a browser
		that cannot run the piece still gets introduced to it — and handed the
		recording. The page itself is never mounted there: its very setup
		opens an AudioContext and a WebGL context. -->
	<TitleSequence v-if="!supported" ready unsupported />
	<NuxtPage v-else />
</template>

<script setup lang="ts">
import {useEventListener} from '@vueuse/core'

import {isSupported} from '~/utils/support'

// ?unsupported forces the fallback screen, so it can be checked from a
// browser that runs the piece just fine
const supported =
	isSupported() &&
	!(
		typeof location !== 'undefined' &&
		new URLSearchParams(location.search).has('unsupported')
	)

// The page itself must never zoom: a pinch on the canvas belongs to the
// ZUI, and a pinch on an overlay (the About panel, a profile bubble) used
// to blow the whole layout up instead. iOS ignores user-scalable=no, so
// the browser's zoom gestures are refused by hand — two-finger touch moves
// here, Safari's proprietary gesture events below (which also cover the
// desktop trackpad). One-finger scrolling never has two touches, and the
// ZUI's pinch rides pointer events, so neither loses anything.
useEventListener(
	() => document,
	'touchmove',
	(event: TouchEvent) => {
		if (event.touches.length > 1) event.preventDefault()
	},
	{passive: false}
)
useEventListener(
	() => document,
	'gesturestart' as 'touchmove',
	event => event.preventDefault(),
	{passive: false}
)
</script>
