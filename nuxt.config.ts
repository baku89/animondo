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
