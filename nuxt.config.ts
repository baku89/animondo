import {defineNuxtConfig} from 'nuxt/config'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
	modules: ['@nuxt/eslint'],
	compatibilityDate: '2024-11-01',
	devtools: {enabled: true},
	ssr: false,
	app: {
		head: {
			charset: 'utf-8',
			viewport: 'width=device-width, initial-scale=1',
			title: 'Animondo | アニm音頭',
			// OGP lives in this static shell: the app is an SPA (ssr: false),
			// and link-preview crawlers do not run JS, so the runtime
			// useSeoMeta in pages/index.vue never reaches them. One HTML
			// serves both languages, hence the bilingual description.
			// The image comes from scripts/build-ogp.sh.
			meta: [
				{
					name: 'description',
					content:
						'8人のEU・日本の作家による手描きアニメーションが、河内音頭に合わせて踊り続けるアニメーションの盆踊り。 / A hand-drawn animated bon-odori by eight EU and Japanese artists, dancing endlessly to Kawachi Ondo.',
				},
				{property: 'og:type', content: 'website'},
				{property: 'og:site_name', content: 'Animondo'},
				{property: 'og:title', content: 'Animondo | アニm音頭'},
				{
					property: 'og:description',
					content:
						'8人のEU・日本の作家による手描きアニメーションが、河内音頭に合わせて踊り続けるアニメーションの盆踊り。 / A hand-drawn animated bon-odori by eight EU and Japanese artists, dancing endlessly to Kawachi Ondo.',
				},
				{property: 'og:url', content: 'https://x.baku89.com/animondo/'},
				{property: 'og:image', content: 'https://x.baku89.com/animondo/ogp.png'},
				{property: 'og:image:width', content: '1200'},
				{property: 'og:image:height', content: '630'},
				{property: 'og:locale', content: 'ja_JP'},
				{property: 'og:locale:alternate', content: 'en_US'},
				{name: 'twitter:card', content: 'summary_large_image'},
			],
			link: [{rel: 'preconnect', href: 'https://use.typekit.net', crossorigin: ''}],
			script: [
				{
					// Adobe Fonts (Typekit) kit for A-OTF Ryumin Pr6N L-KL.
					// Japanese fonts use dynamic subsetting, which is only served
					// via the JS embed — the plain CSS kit URL returns HTTP 412.
					innerHTML: `(function(d){var config={kitId:'akx2ghp',scriptTimeout:3000,async:true},h=d.documentElement,t=setTimeout(function(){h.className=h.className.replace(/\\bwf-loading\\b/g,"")+" wf-inactive";},config.scriptTimeout),tk=d.createElement("script"),f=false,s=d.getElementsByTagName("script")[0],a;h.className+=" wf-loading";tk.src='https://use.typekit.net/'+config.kitId+'.js';tk.async=true;tk.onload=tk.onreadystatechange=function(){a=this.readyState;if(f||a&&a!="complete"&&a!="loaded")return;f=true;clearTimeout(t);try{Typekit.load(config)}catch(e){}};s.parentNode.insertBefore(tk,s)})(document);`,
				},
			],
		},
		baseURL: '/animondo/',
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
	runtimeConfig: {
		public: {},
	},
})
