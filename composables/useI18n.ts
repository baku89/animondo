const messages = {
	en: {
		'tap.title': 'Tap To Start',
		'about.button.label': 'About this project',
		'about.title': 'About Animondo',
		'about.body':
			'Animondo is an animated bon-odori created for the Osaka Expo 2025 EU–Japan Animation Residency. Eight artists each contributed hand-drawn animation along a shared template, and the system arranges and recombines their tiles as a cellular automaton — dancing endlessly to the rhythm of Kawachi Ondo.',
		'about.artists.label': 'Residency artists',
		'about.artists.list':
			'noemie · baku · sumito · masa · edmunds · honami · shinobu · sander · laura · lucija',
		'about.music.label': 'Music',
		'about.music.value': 'Kawachi-ondo, Yayoi-kai and Teppou Toramaru',
		'about.curators.label': 'Curators',
		'about.curators.value': 'Clemence Bragard · Koyo Yamashita',
		'about.recording.label': 'Recording',
		'about.recording.value': 'Atiqa Kawakami · Noémie Marsily',
		'about.mentors.label': 'Mentors',
		'about.mentors.value': 'Michelle and Uri Kranot · Koji Yamamura',
		'about.thanks.label': 'Special thanks',
		'about.thanks.value':
			'Christina Kamperi · Dima Al Youzbaki · Kenji Kadowaki · Kota Nakamura · Isabelle Cavé · Noel Kitayama · Pero Fukuda · Ric Alkemade · Sana Ouchtati · Yuki Arai · Kagan Hotel',
		'about.type.label': 'Typefaces',
		'about.type.value': 'BBB Sprat by Ethan Nakache & Bye Bye Binary',
		'about.support.label': 'Supported by',
		'about.support.value': 'the European Union',
		'about.close': 'Close',
	},
	ja: {
		'tap.title': 'タップで開始',
		'about.button.label': 'このプロジェクトについて',
		'about.title': 'Animondo について',
		'about.body':
			'Animondo は、大阪・関西万博 2025 EU–日本 アニメーションレジデンシーから生まれたアニメーションの「盆踊り」です。8 人の作家がそれぞれ共通のテンプレートに沿って手描きアニメーションを制作し、それらをセル・オートマトンとして組み合わせ、河内音頭のリズムに合わせて踊り続けます。',
		'about.artists.label': 'レジデンシー参加作家',
		'about.artists.list':
			'noemie · baku · sumito · masa · edmunds · honami · shinobu · sander · laura · lucija',
		'about.music.label': '音楽',
		'about.music.value': '河内音頭　弥生会 と 鉄砲虎丸',
		'about.curators.label': 'キュレーション',
		'about.curators.value': 'Clemence Bragard · 山下宏洋',
		'about.recording.label': '録音',
		'about.recording.value': 'Atiqa Kawakami · Noémie Marsily',
		'about.mentors.label': 'メンター',
		'about.mentors.value': 'Michelle and Uri Kranot · 山村浩二',
		'about.thanks.label': 'Special Thanks',
		'about.thanks.value':
			'Christina Kamperi · Dima Al Youzbaki · Kenji Kadowaki · Kota Nakamura · Isabelle Cavé · Noel Kitayama · Pero Fukuda · Ric Alkemade · Sana Ouchtati · Yuki Arai · Kagan Hotel',
		'about.type.label': '書体',
		'about.type.value': 'BBB Sprat（Ethan Nakache & Bye Bye Binary）',
		'about.support.label': '助成',
		'about.support.value': '欧州連合',
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
