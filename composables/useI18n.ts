const messages = {
	en: {
		'tap.title': 'Tap To Start',
		'tap.youtube': 'Play on YouTube',
		'tap.unsupported': 'This browser cannot run the piece.',
		'about.button.label': 'About this project',
		'about.title': 'About Animondo',
		'about.body':
			'Animondo is an animated bon-odori created for the Osaka Expo 2025 EU–Japan Animation Residency. Eight artists each contributed hand-drawn animation along a shared template, and the system arranges and recombines their tiles as a cellular automaton — dancing endlessly to the rhythm of Kawachi Ondo.',
		'about.artists.label': 'Residency artists',
		'about.artists.list':
			'Baku Hashimoto · Edmunds Jansons · Honami Yano · Laura Gonçalves · Lucija Mrzljak · Masa Kudo · Noémie Marsily · Sander Joon · Shinobu Soejima · Sumito Sakakibara',
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
		'launchpad.open': 'Pattern pads',
		'launchpad.close': 'Close pattern pads',
		'sound.mute': 'Mute',
		'sound.unmute': 'Unmute',
		'sound.notice': 'Sound on',
		'explore.notice.pc': 'Drag and scroll to explore!',
		'explore.notice.mobile': 'Pinch and swipe to explore!',
		'bubble.site': 'Website',
	},
	ja: {
		'tap.title': 'タップで開始',
		'tap.youtube': 'YouTube で再生',
		'tap.unsupported': 'このブラウザでは再生できません。',
		'about.button.label': 'このプロジェクトについて',
		'about.title': 'Animondo について',
		'about.body':
			'Animondo は、大阪・関西万博 2025 EU–日本 アニメーションレジデンシーから生まれたアニメーションの「盆踊り」です。8 人の作家がそれぞれ共通のテンプレートに沿って手描きアニメーションを制作し、それらをセル・オートマトンとして組み合わせ、河内音頭のリズムに合わせて踊り続けます。',
		'about.artists.label': 'Residency artists',
		'about.artists.list':
			'橋本麦 · エドムンズ・ヤンソンス · 矢野ほなみ · ローラ・ゴンサルヴェス · ルシア・マルツリジャーク · 工藤雅 · ノエミ・マルシリ · サンダー・ヨン · 副島しのぶ · 榊原澄人',
		'about.music.label': 'Music',
		'about.music.value': '『河内音頭』弥生会と鉄砲虎丸',
		'about.curators.label': 'Curators',
		'about.curators.value': 'クレマンス・ブラガール · 山下宏洋',
		'about.recording.label': 'Recording',
		'about.recording.value': '川上アチカ · ノエミ・マルシリ',
		'about.mentors.label': 'Mentors',
		'about.mentors.value': 'ミシェル&ウリ・クラノット · 山村浩二',
		'about.thanks.label': 'Special thanks',
		'about.thanks.value':
			'クリスティーナ・カンペリ · ディマ・アル・ユーズバキ · 門脇健路 · 中村洸太 · イザベル・カヴェ · 北山ノエル · 福田ぺろ · リック・アルケマーデ · サナ・ウシュタティ · 新井佑季 · 河岸ホテル',
		'about.type.label': 'Typefaces',
		'about.type.value': 'BBB Sprat by Ethan Nakache & Bye Bye Binary',
		'about.support.label': 'Supported by',
		'about.support.value': 'the European Union',
		'about.close': '閉じる',
		'launchpad.open': 'パターンパッド',
		'launchpad.close': 'パターンパッドを閉じる',
		'sound.mute': '消音',
		'sound.unmute': '消音解除',
		'sound.notice': '音が出ます',
		'explore.notice.pc': 'ドラッグやスクロールしてね！',
		'explore.notice.mobile': 'ピンチやスワイプしてね！',
		'bubble.site': 'ウェブサイト',
	},
} as const

export type Locale = keyof typeof messages
export type MessageKey = keyof (typeof messages)['en']

const STORAGE_KEY = 'animondo:locale'

// A previous explicit choice wins; otherwise follow the browser language.
// localStorage can throw (private windows, blocked site data), and a failed
// read or write must never take the page down with it.
function detectInitial(): Locale {
	if (typeof window === 'undefined') return 'en'
	try {
		const saved = window.localStorage.getItem(STORAGE_KEY)
		if (saved === 'en' || saved === 'ja') return saved
	} catch {
		// fall through to the browser language
	}
	return navigator.language.toLowerCase().startsWith('ja') ? 'ja' : 'en'
}

const locale = ref<Locale>('en')
let initialized = false

function ensureInitialized() {
	if (initialized || typeof window === 'undefined') return
	// Set before the watcher exists, so only explicit switches are saved
	locale.value = detectInitial()
	watch(locale, v => {
		try {
			window.localStorage.setItem(STORAGE_KEY, v)
		} catch {
			// The choice still applies for this visit
		}
	})
	initialized = true
}

export function useI18n() {
	ensureInitialized()
	const t = (key: MessageKey) => messages[locale.value][key]
	return {locale, t}
}
