<template>
	<!-- The title screen is plain canvas and draws anywhere, so a browser
		that cannot run the piece still gets introduced to it — and handed the
		recording. The page itself is never mounted there: its very setup
		opens an AudioContext and a WebGL context. -->
	<TitleSequence v-if="!supported" ready unsupported />
	<NuxtPage v-else />
</template>

<script setup lang="ts">
import {isSupported} from '~/utils/support'

const supported = isSupported()
</script>
