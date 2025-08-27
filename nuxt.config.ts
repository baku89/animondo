import {defineNuxtConfig} from 'nuxt/config'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
	modules: ['@nuxt/eslint', '@pinia/nuxt'],
	compatibilityDate: '2024-11-01',
	devtools: {enabled: true},
	ssr: false,
	app: {
		head: {
			charset: 'utf-8',
			viewport: 'width=device-width, initial-scale=1',
			link: [
				{rel: 'preconnect', href: 'https://fonts.googleapis.com'},
				{rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: ''},
				{
					rel: 'stylesheet',
					href: 'https://fonts.googleapis.com/css2?family=Fira+Code:wght@300..700&family=Zen+Kaku+Gothic+New:wght@400;700&display=swap',
				},
			],
		},
		baseURL: '/eu-japan-animation-residency-collab/',
		buildAssetsDir: '/_nuxt/',
	},
	css: ['~/assets/style.styl'],
	vite: {
		css: {
			preprocessorOptions: {
				stylus: {},
			},
		},
		assetsInclude: ['**/*.vert', '**/*.frag'],
	},
	typescript: {
		tsConfig: {
			compilerOptions: {
				types: ['vite-plugin-glsl/ext'],
			},
		},
	},
	runtimeConfig: {
		public: {},
	},
})
