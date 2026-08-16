const messages = {
	en: {
		'tap.title': 'Tap To Start',
		'tap.subtitle.line1': 'Osaka EXPO EU-Japan Animation Residency',
		'tap.subtitle.line2': 'Collaborative Project',
		'about.button.label': 'About this work',
		'about.title': 'About Animondo',
		'about.body':
			'Animondo is an animated bon-odori created for the Osaka Expo 2025 EU–Japan Animation Residency. Eight artists each contributed hand-drawn animation along a shared template, and the system arranges and recombines their tiles as a cellular automaton — dancing endlessly to the rhythm of Kawachi Ondo.',
		'about.artists.label': 'Artists',
		'about.artists.list':
			'noemie · baku · sumito · masa · edmunds · honami · shinobu · sander',
		'about.music.label': 'Music',
		'about.music.value': 'Kawachi Ondo (traditional Japanese folk music)',
		'about.type.label': 'Typefaces',
		'about.type.value': 'BBB Sprat by Ethan Nakache & Bye Bye Binary',
		'about.close': 'Close',
	},
	ja: {
		'tap.title': 'タップで開始',
		'tap.subtitle.line1': '大阪・関西万博 2025 EU–日本 アニメーションレジデンシー',
		'tap.subtitle.line2': 'コラボレーションプロジェクト',
		'about.button.label': 'この作品について',
		'about.title': 'Animondo について',
		'about.body':
			'Animondo は、大阪・関西万博 2025 EU–日本 アニメーションレジデンシーから生まれたアニメーションの「盆踊り」です。8 人の作家がそれぞれ共通のテンプレートに沿って手描きアニメーションを制作し、それらをセル・オートマトンとして組み合わせ、河内音頭のリズムに合わせて踊り続けます。',
		'about.artists.label': '参加作家',
		'about.artists.list':
			'noemie · baku · sumito · masa · edmunds · honami · shinobu · sander',
		'about.music.label': '音楽',
		'about.music.value': '河内音頭',
		'about.type.label': '書体',
		'about.type.value': 'BBB Sprat（Ethan Nakache & Bye Bye Binary）',
		'about.close': '閉じる',
	},
} as const

export type Locale = keyof typeof messages
export type MessageKey = keyof (typeof messages)['en']

const STORAGE_KEY = 'animondo:locale'

function detectInitial(): Locale {
	if (typeof window === 'undefined') return 'en'
	const saved = window.localStorage.getItem(STORAGE_KEY)
	if (saved === 'en' || saved === 'ja') return saved
	return navigator.language.toLowerCase().startsWith('ja') ? 'ja' : 'en'
}

const locale = ref<Locale>('en')
let initialized = false

function ensureInitialized() {
	if (initialized || typeof window === 'undefined') return
	locale.value = detectInitial()
	watch(locale, v => window.localStorage.setItem(STORAGE_KEY, v))
	initialized = true
}

export function useI18n() {
	ensureInitialized()
	const t = (key: MessageKey) => messages[locale.value][key]
	return {locale, t}
}
