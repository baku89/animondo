import type {Locale} from '~/composables/useI18n'

export interface ArtistInfo {
	id: string
	name: Record<Locale, string>
	profile: Record<Locale, string>
	url: string
}

// Ordered by video index (must match the sprite list in pages/index.vue)
export const ARTISTS: ArtistInfo[] = [
	{
		id: 'noemie',
		name: {en: 'Noémie Marsily', ja: 'ノエミ・マルシリ'},
		profile: {
			en: 'Belgian illustrator, comics artist and animation filmmaker based in Brussels. Co-directed shorts with Carl Roosens; her solo film Ce qui bouge est vivant premiered in 2022.',
			ja: 'ブリュッセル拠点のイラストレーター・漫画家・アニメーション作家。カール・ルーセンスとの共同監督作を経て、2022年に単独監督作『Ce qui bouge est vivant』を発表。',
		},
		url: 'https://noemiemarsily.tumblr.com/',
	},
	{
		id: 'baku',
		name: {en: 'Baku Hashimoto', ja: '橋本麦'},
		profile: {
			en: 'Visual artist working across generative art, motion graphics, stop-motion and interactive design. Grand Prize at Tokyo TDC Annual Awards 2025.',
			ja: 'アニメーションから生成アート、インタラクティブデザインまで様々なメディアを横断して制作する映像作家。2025年東京TDC賞グランプリ受賞。',
		},
		url: 'https://baku89.com',
	},
	{
		id: 'sumito',
		name: {en: 'Sumito Sakakibara', ja: '榊原澄人'},
		profile: {
			en: 'Animation artist born 1980 in Tokachi, Hokkaido; Royal College of Art graduate. Creates single-space animations where the same figures recur across looping time.',
			ja: '1980年北海道十勝生まれ、英国王立芸術学院修了。反復と変容、同一人物が一つの空間に共存する構造を用いたアニメーションを制作。',
		},
		url: 'https://sumitosakakibara.com',
	},
	{
		id: 'masa',
		name: {en: 'Masa Kudo', ja: '工藤雅'},
		profile: {
			en: 'Animation filmmaker from Hokkaido, based in Tallinn. Works frame by frame with drawing, 8mm film and cyanotype; screened at Animafest Zagreb, GLAS and Image Forum Festival.',
			ja: '北海道出身、タリン在住のアニメーション作家。ドローイングや8mmフィルム、サイアノタイプなどの技法でコマを紡ぐ。ザグレブ、GLASなどで上映。',
		},
		url: 'https://masakudo.wordpress.com/',
	},
	{
		id: 'edmunds',
		name: {en: 'Edmunds Jansons', ja: 'エドムンズ・ヤンソンス'},
		profile: {
			en: 'Latvian animation director and illustrator, founder of Riga studio Atom Art. Directed Choir Tour and the feature Jacob, Mimmi and the Talking Dogs (2019).',
			ja: 'ラトビアのアニメーション監督・イラストレーター。スタジオAtom Art創設者。短編『Choir Tour』、長編『Jacob, Mimmi and the Talking Dogs』を監督。',
		},
		url: 'https://atomart.lv/',
	},
	{
		id: 'honami',
		name: {en: 'Honami Yano', ja: '矢野ほなみ'},
		profile: {
			en: "Animation filmmaker born 1991 in Ehime, Japan. A Bite of Bone (2021) won the Ottawa Grand Prize; Eri (2026) was selected for Cannes' Directors' Fortnight.",
			ja: '1991年愛媛生まれのアニメーション作家。『骨嚙み』が第45回オタワ国際アニメーション映画祭グランプリ受賞、『Eri』はカンヌ監督週間に選出。',
		},
		url: 'https://honamiyano.com/',
	},
	{
		id: 'shinobu',
		name: {en: 'Shinobu Soejima', ja: '副島しのぶ'},
		profile: {
			en: 'Artist and stop-motion director based in Tokyo, animating puppets and organic materials such as rice, meat and insects. Special Mention, Ecumenical Jury at Oberhausen 2022.',
			ja: '米や肉、昆虫などの有機物とパペットを用いるストップモーション作家・美術家。オーバーハウゼン国際短編映画祭エキュメニカル審査員特別表彰を受賞。',
		},
		url: 'https://www.shinobusoejima.com/',
	},
	{
		id: 'sander',
		name: {en: 'Sander Joon', ja: 'サンデル・ヨーン'},
		profile: {
			en: 'Estonian film director and animator. His short Sierra (2022) became the first Estonian animation shortlisted for an Academy Award.',
			ja: 'エストニアの映画監督・アニメーター。短編『Sierra』（2022）はエストニアのアニメーションとして初めて米アカデミー賞ショートリスト入りを果たした。',
		},
		url: 'https://sanderjoon.com/',
	},
]
