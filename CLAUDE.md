# CLAUDE.md — Animondo（アニ音頭）

このリポジトリの構造・設計思想・運用ルールを、Claude / 他LLM が読んで作業しやすい形でまとめたメモ。**日本語で書かれているのは意図的なもの**（コードコメント・コミットメッセージは英語のままにする — `.cursorrules` 参照）。

---

## プロジェクト概要

EU–日本 アニメーション・レジデンシー（大阪万博 2025）の共同制作プロジェクト。8 人の作家が同じテンプレートに従って手描きアニメーション素材を提出し、それらをセル・オートマトン的に組み合わせて「アニメーションの音頭（=Animondo）」を生成する Web 作品。

- 公開タイトル: **Animondo**
- 公開先: <https://x.baku89.com/animondo>（baseURL: `/animondo/`）
- リポジトリ: `baku89/animondo`（private）
- BGM: `public/kawachiondo_loop.opus`（河内音頭、m4a フォールバック付き）— 8.8 fps のステップとほぼ同期。Web Audio でギャップレスループ（`useKawachiAudio.ts` 参照）
- 参加作家（現状 active）: noemie / baku / sumito / masa / edmunds / honami / shinobu / sander の 8 名
- laura / lucija は将来再参加する可能性あり（`pages/index.vue` にコメントアウト済みの placeholder あり）

### コア・コンセプト：手描きアニメを FSM として扱う

各作家は「**6 種類の遷移アニメ + ハブフレーム**」を描く（補足資料 `../osaka_expo_collaborative/template_png/` 参照）。これがそのままタイルの状態遷移を構成する：

- **Hub frame**（静止/不在の中央状態）
- **Appear**（無 → ハブへの誕生 8 frames）
- **Vanish**（ハブ → 無への消滅 7 frames）
- **Up / Right / Down / Left**（ハブからその方向へ通り抜ける 7 frames）

これを **「セルに入ってくる向き」×「出ていく向き」 = 5×5 = 25 状態**を持つ 2D セル・オートマトンとして扱う（5 = Up/Right/Down/Left/None）。25 状態 → 6 種類のタイル素材（Birth / Up / Right / Down / Left / Death / None）+ 回転 0/90/180/270° + 上下反転 へのマッピングを `utils/tile.ts` の `TILE_DISPLAY_TABLE` が定義している。

「向き」は **絶対方向**（カメラから見て上下左右）で、`in` は「どこから歩いてきたか」、`out` は「どこへ抜けていくか」を意味する。

### 1 ステップ = 8 フレーム

タイマーは 8.8 Hz（`1000/8.8 ms` 間隔）。`currentFrame % 8 === 0` の瞬間にオートマトンが 1 ステップ進む（`tileMap.nextStep()`）。残り 8 frames 分でビデオが進み、見かけ上ハブ→出口（または入口→ハブ）の半サイクルがちょうど終わる。**隣接セル間で連続して見えるように**、`#currentPattern` は前ステップの out と次ステップの in を補間した「橋渡しパターン」になっている（`interpolateMovePattens` 参照）。

---

## 技術スタック

- Nuxt 4（SSR 無効, SPA モード）
- Vue 3 + TypeScript
- WebGL: regl（Worker 内の `workers/tileRenderer.worker.ts`、フォールバックは `composables/useTileRenderer.ts` のメインスレッド版）
- 数学: linearly（vec2 / mat2d / mat3 / scalar）
- ユーティリティ: lodash-es, @vueuse/core, @vueuse/integrations
- スタイル: Stylus
- パッケージマネージャ: **yarn**（1.22.x — Corepack 経由）

```bash
yarn dev         # 開発サーバ（--host 付き、LAN 経由でモバイル確認可能）
yarn generate    # 静的サイトを .output/public に出力（dist/ もシンボリックリンク）
yarn preview     # generate 後にプレビュー
yarn lint        # ESLint --fix
yarn build       # nuxt build（通常は generate で十分）
```

---

## ディレクトリ構成

```
.
├── app.vue                      # <NuxtPage/> のみ
├── nuxt.config.ts               # baseURL=/animondo/, SSR=false, Typekit 埋め込み
├── pages/
│   └── index.vue                # ★ 本番ビュー: インタラクティブ (ZUI付き)
├── components/shaders/
│   ├── default.vert             # 全画面クアッド頂点シェーダ
│   └── tile.frag                # ★ メインのフラグメントシェーダ
├── composables/
│   ├── useTileRenderer.ts       # ★ レンダラーの共通インターフェース（Worker 版とメインスレッド版の選択・後述）
│   ├── useVideoTexture.ts       # 1 本の <video> をテクスチャ化、setFrame(n) でシーク
│   ├── useVideoTextureArray.ts  # 上の N 本まとめ版（メインスレッド・フォールバック用）
│   ├── useKawachiAudio.ts       # BGM のギャップレスループ再生（Web Audio）
│   └── useZUI.ts                # ピンチ/ドラッグ/ホイールズーム（index.vue 専用）
├── workers/
│   └── tileRenderer.worker.ts   # ★ 描画・デコード・アップロードの本命経路（OffscreenCanvas + regl）
├── utils/
│   ├── tile.ts                  # ★ Tile / Direction enum、TILE_DISPLAY_TABLE、エンコード
│   ├── TileMap.ts               # ★ オートマトン本体（純ロジック。pixels をレンダラーに渡す）
│   ├── spriteDecoder.ts         # WebCodecs パイプライン（demux→VideoDecoder、Worker/メイン共用）
│   ├── patterns.ts              # ★ パターン辞書（clockwise / gather / scatter ほか）
│   ├── Array2D.ts               # トロイダル 2D 配列ユーティリティ
│   ├── artists.ts               # ★ 作家データのローダ（content/ の md をパース）
│   └── randomInt.ts
├── content/
│   └── artists/{id}.{en,ja}.md  # ★ 作家プロフィール（後述）
├── components/
│   ├── AboutModal.vue           # ? ボタンで開く About
│   └── TitleSequence.vue        # ★ タイトルアニメ＋再生ボタン（後述）
├── videos/animondo_title.mov    # タイトルの元データ（qtrle/ARGB, 12fps, 49F）
├── scripts/
│   ├── build-title-sprite.sh    # .mov → public/title-sprite.webp
│   └── title-sprite-bbox.py     # 上のスクリプトが使う crop 値を算出
├── public/
│   ├── kawachiondo_loop.opus    # BGM（本命。Safari<18.4 用に .m4a も併置）
│   ├── title-sprite.webp        # ★ タイトル 7×7 スプライト（838×214/コマ）
│   └── sprites/{artist}.mp4     # ★ 各作家の素材（8 本、3×2 グリッド × 8 frames）
├── assets/style.styl            # グローバル CSS
└── .github/workflows/deploy.yml # main push で SFTP ミラー（後述）
```

★ = いじることが多い・概念的に重要なファイル。

### 外部参照

- 補足資料: `../osaka_expo_collaborative/`（このリポ外）
    - `template_png/`: 作家配布用テンプレ画像（HubFrame / Up_1..7 / Down_1..7 / Left_1..7 / Right_1..7 / Appear_1..8 / Vanish_1..7 — 1 作家あたり 44 枚）
    - `sample_baku/`, `sample_baku.mp4`: 参照実装（魚が泳ぐサンプル）
    - `osaka-expo-anim-residency-collab.aep`: 各作家の PNG 連番から `public/sprites/*.mp4` を書き出す After Effects プロジェクト
    - `*_template_A4.pdf` / `.ai`: 配布用テンプレ（紙）
- Notion 仕様書: `EU-JP-Animation-Residency-Collaborative-Tiling-Project`（外部リンク）

---

## データ表現と GPU レンダリングの仕組み

### スプライト MP4 のレイアウト

`public/sprites/{artist}.mp4` は **3 列 × 2 行のグリッドに 6 種類のタイルアニメを並べた**動画。各セルは 8 フレームのループ。

| 列\行 | 0           | 1           | 2           |
|------|-------------|-------------|-------------|
| 0    | **Birth**   | **Up**      | **Right**   |
| 1    | **Down**    | **Left**    | **Death**   |

シェーダ側では `Tile` enum の値 - 1 を 3 で割って (col, row) を得て、UV を中心 50%（`mix(vec2(0.25), vec2(0.75), uv)`）に絞って読み出す（隣接セルと 0.5 オーバーラップさせる前提）。

### CPU→GPU のステート受け渡し（`TileMap.pixels`）

`TileMap` は純ロジックで、タイル状態を RGB ピクセルバッファ（`pixels`）に書き出すだけ。GPU への転送はレンダラー（後述の Worker またはメインスレッド版）が行う。

- サイズ: `Patterns.size.width × Patterns.size.height` = **16×16**（`utils/patterns.ts` 末尾の `size` 定数で変更可）
- フォーマット: RGB / uint8 / nearest / repeat
- R チャネル: ビデオインデックス（0..7、最大 0..9 までエンコード可）
- G チャネル: ビット詰め `__FRRTTT`
    - bits 0–2: Tile enum（None=0..Death=6）
    - bits 3–4: 回転（0..3 = 0°/90°/180°/270°）
    - bit 5: 上下反転フラグ
- B チャネル: 未使用

詳細は `utils/tile.ts` の `tileDisplayToColorValue` と `components/shaders/tile.frag` の `unpackTileData` を対で読むと早い。

### タイルの「重なり描画」

`tile.frag` の `drawOverlappingTiles` は注目セル + 上下左右 4 セルを **min ブレンド**（ダーケン）で合成している。各作家のアニメは余白に絵がはみ出すので、隣のセルの素材が画面上同じ位置に重なる必要があるため。手描きアニメの線が破綻なく繋がる根拠はここにある。

### ナビゲーション（ZUI）

`index.vue`: `useZUI` がピンチ/ドラッグ/ホイールでカメラ行列を作り、`navMatrix` として送る。シェーダ側はトロイダル（`Array2D.get` がモジュロ）なので、ZUI でどこまでパンしても画面が埋まり続ける。

### レンダラーは Worker（`useTileRenderer` / `tileRenderer.worker.ts`）

Safari は `texSubImage2D(VideoFrame)` の YUV→RGB 変換を CPU でやる（実測 ~6ms/本）。拍フレームごとに 8 本一括アップロードしていた頃は、メインスレッドが ~45ms × 9 回/秒 止まり、ボタンやバブルまで巻き込んでカクついていた。そこで**デコード・アップロード・regl 描画を丸ごと Worker + OffscreenCanvas に移設**した。

- `createTileRenderer(canvas, …)` が Worker 版を試し、無理ならメインスレッド版（従来コードの `useVideoTextureArray` + regl）へフォールバック。両者は同じ契約を話す:
    - `present(frame, pixels?)`: スプライトのコマを表示。オートマトンが進んだ拍では新しいタイルマップも**同じスワップで**適用（旧ターンが一瞬も見えないためのアトミシティ）
    - `prepare(frame)`: 次のコマへ向けたデコード開始
    - `setTileMapPixels(px)`: キャッチアップ時（スプライトを触らずパターンだけ進める）
    - `render(props)`: 毎 rAF、カメラ行列・focus・キャンバスサイズを渡して描画
- Worker 内は**ダブルバッファ**: `prepare()` が 8 フレーム分の空き時間に裏テクスチャへ 1 本ずつアップロード（アップロード間に macrotask を挟み、'frame' の描画を通す）。`present()` は表裏スワップ + タイルマップ適用だけなので、拍頭にバーストが発生しない
- プロトコルは 2 段階: `load`（何もコミットしない。VideoDecoder / Worker 内 WebGL / H.264 対応をここで判定し、ダメなら 'unsupported' → メインスレッド版へ）→ `loaded` を見てから `transferControlToOffscreen()` して `start`。canvas を渡した後の失敗（シェーダ拒否など）は 'error' = 致命扱いで `index.vue` の `startupError` へ
- 拍クロック・オートマトン（`TileMap`）・ZUI・選択ロジックはメインスレッドに残る。`tileMap.pixels` は postMessage の structured clone がコピーしてくれるので転送安全
- `decodeFrame`（生のデコード処理）と `ensureDecoded`（チェーン管理）は `utils/spriteDecoder.ts` で共用。**チェーンのリンク内から `ensureDecoded` を呼んではいけない**（自分自身を待ってデッドロックする — Worker 側は自前チェーンに `decodeFrame` を繋いでいる）

---

## エントリポイント

### `pages/index.vue` — 本番ビュー（インタラクティブ）
- 画面ぴったりにキャンバスを敷く、`useZUI` でズーム/パン操作可能
- `Tap To Start` ボタンで `useKawachiAudio.start()` → 音声再生開始＋ループ駆動
- `useIntervalFn(..., 1000 / 8.8)` で常時更新（RAF はキャンバスサイズに同期）
- パターンシーケンスはここで完結している（`tileMap.setMovePattern(function*() { ... })`）

> 過去にあった `pages/export.vue`（PNG 連番書き出し用ビュー）は現在 `video-export` ブランチに退避してある。再開したい場合はそちらを参照。

### `app.vue` — 対応ブラウザの門番

`utils/support.ts` の `isSupported()` が false なら `<NuxtPage>` を**マウントせず**、`TitleSequence` を `unsupported` で出す（タイトルの下が Play ボタンではなく YouTube へのリンクになる）。`pages/index.vue` は setup の時点で `AudioContext` を開き WebGL を要求するので、判定は必ずページの外側で行う。

判定しているのは「無ければ例外で落ちる」ものだけ：WebGL / `AudioContext` / `Promise.withResolvers`（実質 Chrome 119・Safari 17.4・Firefox 121 が下限）。WebCodecs は `useVideoTextureArray` が `<video>` にフォールバックするので**含めない**。

機能判定を通り抜けたあとの失敗（シェーダのコンパイル拒否、canvas 移譲後の Worker クラッシュなど）は `index.vue` の `startupError` が拾い、音を止めてタイトル画面を同じ YouTube 表示で戻す。動画の URL は `TitleSequence.vue` の `YOUTUBE_URL` 定数。

---

## 作家プロフィール（`content/artists/`）

作家データは Markdown で管理する。1 作家 × 1 言語 = 1 ファイル：`content/artists/{id}.en.md` と `{id}.ja.md`。

```markdown
---
name: ノエミ・マルシリ
url: https://noemiemarsily.tumblr.com/
---

ブリュッセル拠点のイラストレーター・漫画家・アニメーション作家。
カール・ルーセンスとの共同監督作を経て、2022年に単独監督作
『Ce qui bouge est vivant』を発表。
```

- frontmatter は `key: value` の 1 行 1 項目のみ（`name` / `url` / `workTitle` / `workYear` が必須）。YAML パーサは使っていないので、ネストや複数行値は非対応
- `workTitle` / `workYear` は代表作（バブル内に画像＋キャプションで表示）。スチルは `public/works/{id}.webp` に置く（出典: HIROSHIMA の上映プログラムページ、16:9 前提・幅 720px の WebP）
- `source:` はプロフィール文の出典 URL（記録用。パーサは既知のキー以外を無視するのでアプリからは参照されない）。複数ある場合は**半角スペース区切り**で 1 行に並べる — URL に空白は含まれないので曖昧にならない
- 本文は **HIROSHIMA ANIMATION SEASON 2026 のレジデンシー掲載ページに作家本人が提出したプレスキットの文面をそのまま**使っている（`source:` 参照）。要約・書き換えはしない方針。麦のみ自分で編集
- そのため**段落は折り返さず 1 行に書く**。折り返すと `unwrapSoftBreaks` の連結時に「15 歳」「第 68 回」のような和欧間スペースが失われ、逐語でなくなる
- 本文がプロフィール。**marked で Markdown としてレンダリング**され、バブルには `v-html` で流し込まれる。ソースはこのリポジトリ内のファイルだけなのでサニタイザは挟んでいない（外部入力を混ぜないこと）
- 段落内の**改行はソース整形扱いで連結される**。連結時、境界の文字が CJK なら空白を入れず、そうでなければ空白 1 個を補う（日本語の行折り返しで不自然な空きが出ないようにするため）。Markdown も HTML も改行を空白に潰すので、レンダラに渡す前段で処理している。`utils/artists.ts` の `unwrapSoftBreaks` 参照
- ただし `-` `*` `>` `#` `1.` ``` などで始まる**ブロック開始行は連結されない**（連結するとリストが 1 段落に潰れるため）。逆にブロック開始行でない行は上の行に連結されるので、リスト項目の折り返しも詰まって表示される
- リンクは `target="_blank" rel="noopener"` が自動で付く（作品を開いたまま別タブで開くため）
- バブル内の `p` / `ul` / `ol` / `li` / `strong` / `a` は `pages/index.vue` の `&__text` で個別にスタイルを当てている。`assets/style.styl` のリセットが `font-weight` や `list-style` を潰しているため
- `url` は言語ごとに別々に持てる（`ArtistInfo.url` は `Record<Locale, string>`）。同じ URL でよければ両ファイルに同じ値を書く

### 作家を追加・削除するとき

1. `content/artists/{id}.en.md` と `{id}.ja.md` を作る
2. `utils/artists.ts` の `ARTIST_IDS` に `id` を追加する。**この配列の順序がビデオインデックス**で、`public/sprites/{id}.mp4` の読み込み順・`TileMap` が保持するインデックスと一致する
3. スプライト `public/sprites/{id}.mp4` を置く（`pages/index.vue` は `ARTISTS` から自動でパスを組み立てる）
4. 9 人目以降は `components/shaders/tile.frag` と `pages/index.vue` の `Uniforms` に `video8` … を足す必要がある

ファイル欠損や frontmatter の書式ミスは、`utils/artists.ts` のモジュール読み込み時に例外を投げる（= dev サーバで即座に落ちる）。

---

## タイトルアニメーション（`components/TitleSequence.vue`）

起動画面。`videos/animondo_title.mov`（qtrle/ARGB、12fps、49 フレーム）を **7×7 のスプライトシート** `public/title-sprite.webp` に変換して使う。`scripts/build-title-sprite.sh` で再生成できる。

### なぜスプライトシートか

素材は「黒インク＋アルファ」なので、情報はアルファ 1 チャンネルにしかない。二値に近いマスクは**空間圧縮が時間圧縮とほぼ同じくらい効く**ため、ロスレス WebP 285 KB に対して VP9 マスク動画は 181 KB —— 差は 100 KB 弱しかない。その差のためにインクの輪郭へリンギングを載せる意味がないので**ロスレス**。ソースのアルファと 1 ピクセルも違わないことを検証済み。

加えて、アルファ付き動画は WebM/VP9（Safari 不可）と HEVC(hvc1)（Chrome 不可）で二重に用意する羽目になる。スプライトなら**その問題自体が発生しない**。フレーム seek も精度の問題が出ない（`useVideoTexture` の悩みがここには無い）。

### 注意点

- **アルファはシート自身が持つ**。CSS マスクにしてはいけない —— `mask-image` の既定は `mask-mode: alpha` で、不透明なグレースケールシートは「全面表示」と解釈され黒い塊になる（実際に一度踏んだ）
- 描画は **canvas に 1 コマだけ `drawImage`**。`background-size: 700%` だと 5866×1498 のシート全体を「タイトルの 7 倍の箱」に合わせて拡大させることになり、DPR 2 では約 29 メガピクセルの中間画像が必要になってエッジが破綻する
- crop 値は `scripts/title-sprite-bbox.py` で出す。**ffmpeg の `cropdetect` は使えない** —— この素材では先頭の「A」を 3px、上下を 5px 削った値を返す
- 素材の実解像度はインク部分で **838×214**。DPR 2 の画面で幅 48rem に置くと 1.83 倍の拡大になるので、シャープにしたければ元データを 2 倍で書き出し直す必要がある

### 再生シーケンス

| フレーム | 動作 |
|---|---|
| 0–20 | ページロード時に一度だけ再生（in アニメーション） |
| 22–30 | 待機ループ |
| 31–48 | 再生ボタン押下後、30 に到達してから最後まで（out アニメーション） |

ループを抜けるのは**必ず 30 の次**なので、押した瞬間ではなく待機アニメの区切りから out に繋がる。終了時に `done` を emit し、`pages/index.vue` が `titleVisible` を false にして破棄する。

再生ボタンは `ready` prop で出す。`index.vue` 側で **8 本のスプライト読み込み＋`document.fonts.ready`**（5 秒でタイムアウト）を待ってから true にしている。ボタンは絶対配置で、**タイトルの位置に影響しない**（消えてもタイトルが動かないため）。オーバーレイ全面がクリック可能で、どこを叩いても開始する。

---

## パターン（`utils/patterns.ts`）

セルオートマトンの「次の手」を表す 16×16 のグリッド。型は `MovePattern = Array2D<Move>`。

### コンビネータ
- `invert(p)`: in/out を入れ替え（=時間反転）
- `offset(p, [dx, dy])`: 位相シフト（トロイダル）
- `rotate90(p)`: 中心まわりに 90° 回転
- `radialMask(p, r)`: 中央 (2r+1) × (2r+1) の範囲だけパターンを適用、外側は None
- `offsetGenerators([dx,dy], gen)`: ジェネレータの各 yield 値に offset をかけるラッパ

### プリミティブ（よく使う順）
- `empty`: 全セル None→None（静止/休符）
- `clockwise` / `counterClockwise`: 中央を起点に時計／反時計回りの流れ
- `up` / `down` / `left` / `right`: 全セルを同方向に流す
- `upDown` / `downUp` / `leftRight` / `rightLeft`: 列/行ごとに交互に逆向き
- `gather` / `scatter`: 中央 4 セルに集合 / 中央から発散（`gather` は対角線で並んだら反対端へ突き抜ける凝った条件あり）
- `horizontalGather` / `verticalGather` / `horizontalScatter` / `verticalScatter`: 軸方向限定版
- `verticalSwap` / `horizontalSwap`: 隣接 2 セルが交差してすれ違う
- `smallClockwise`: 2×2 ブロック単位での小さい時計回り
- `rightAppearVanish`: 4 セル周期で `None→Right ... Left→Right ... Left→None`（右へ流れながら誕生消滅）

### 新しいパターンを追加するとき

1. `utils/patterns.ts` に `export const myPattern = new Array2D<Move>({...size, initialize: ... })` を足す。
2. 必要なら `invert(myPattern)` で双対も足す。
3. `pages/index.vue` の `tileMap.setMovePattern(function* () {...})` 内で `yield Patterns.myPattern` する。
4. パターンが「途切れず」連結されるかは `TileMap.interpolateMovePattens` 任せ。前ステップの `out` と次ステップの `in` が **同じ向き** になるよう設計すると違和感が消える。

---

## TileMap の動作モデル

```
nextStep() ごとに:
  1. patternGenerator.next() で次のパターンを取り出す
  2. 前パターンの out を見て、各セルに「どの隣セルから誰が流入してくるか」を解決
  3. 流入元があれば、その隣セルの tileInfo (videoIndex, flipVertical) を継承
  4. 流入元が無く、次パターンで out があるセルは「誕生」 → generateTileInfo() で新規割当
  5. それ以外は前回の tileInfo を据え置き
  6. #currentPattern = interpolate(前パターン, 新パターン) を作って texture を更新
```

### 個別作家ハック

- **honami** （`HonamiIndex = 5`）: `neighbourMove.in === neighbourMove.out` のとき `flipVertical` をトグル。彼女の素材だけ「同方向で通り抜ける」とき表示が反転する仕様（手描きの向きを補正している）。
- **generateTileInfo**: デフォルトはランダムな videoIndex（8 作家から 1 名選ぶ）。`tileInfoGenerator` をパターン yield と同時に切り替え可能（`yield {move, tileInfoGenerator}` 形式）で、生まれ順や座標・step から index を決める実装を差し替えられる。

---

## ビデオ素材まわり

- **fps**: ソース 12 fps を想定（`useVideoTexture.setFrame(n, fps=12)` で `currentTime = n/12` にシーク）
- **同期**: `setFrame` は `requestAnimationFrame` で `currentTime` の収束を待ってから `texture.subimage()` を叩く。シークの待ちが詰まるとガクつく
- **配信パス**: `'/animondo/' + videoSrc` と baseURL を直書きしている（`useVideoTexture`・`tileRenderer.worker.ts`・`useVideoTextureArray` の 3 箇所）。dev サーバ（baseURL なし）でも本番（baseURL=`/animondo/`）でも同じ URL を使うために固定。**baseURL を変える場合はここも要修正**

---

## デプロイ

`baku89/corporate-poetry` と同じ方式。`main` への push（と `workflow_dispatch`）で `.github/workflows/deploy.yml` が走り、`yarn generate` の出力 `.output/public` を lftp で SFTP サーバへ **mirror** する。公開先は <https://x.baku89.com/animondo>。

- `mirror --reverse --delete`: Nuxt はビルド毎にハッシュ付きアセット名を吐くので、`--delete` が無いと古い `_nuxt/*.js` がサーバに永久に残る
- `concurrency: deploy-main` / `cancel-in-progress`: 連続 push で mirror が交錯しないよう常に 1 本だけ走らせる
- 必要な Secrets（Repository → Settings → Secrets and variables → Actions）: `SFTP_HOST` / `SFTP_PORT`（省略時 22）/ `SFTP_USER` / `SFTP_PRIVATE_KEY` / `SFTP_REMOTE_DIR` / `SFTP_HOST_FINGERPRINT`（任意・未設定なら CI 中に `ssh-keyscan` で TOFU）

ハマりどころは workflow の YAML 内コメントに全部書いてあるので、いじる前にそっちを読むのが早い（特に `open -u "$SFTP_USER,"` の末尾カンマ）。

---

## 既知の課題 / 「ブラッシュアップしたい」リスト

ユーザーが目指す方向は **Web サイト = インタラクティブなアニメーション作品** への昇華。検討対象の例：

- [x] ~~ビデオ 8 本を並列 seek している部分のパフォーマンス改善~~ → WebCodecs 化で解決。`utils/spriteDecoder.ts` が `utils/mp4Demux.ts`（自前の最小 MP4 パーサ）でサンプルを取り出し、`VideoDecoder` に 1 コマずつ食わせて `flush()` で確定受領する。スプライトは all-intra H.264 なので任意コマを単独デコード可能。`<video>` + seek は `VideoDecoder` 非対応ブラウザ用のフォールバックとして `useVideoTexture` に残存
- [x] ~~Safari で拍ごとにメインスレッドが止まる（`texSubImage2D(VideoFrame)` が CPU 変換 ~6ms/本 × 8 本バースト）~~ → レンダラーの Worker 移設＋ダブルバッファで解決（「レンダラーは Worker」の節を参照）。実測: Safari のメインスレッドストール（>30ms）が 6 秒間 88 回 → 0 回
- [x] ~~スプライトのフォーマット（mp4 → WebP アニメ or 静止画スプライトシート）の検討~~ → mp4 続投で決着。シート全展開は GPU 384MB（8 作家 × 8 コマ × 1536×1024 RGBA）で不可。mp4 + WebCodecs なら GPU は現在コマのみ（48MB）でコマ精度も完全
- [ ] UI: 「Tap To Start」だけの一発キックではなく、テンポ・パターン・参加作家を選べるインタラクション
- [ ] モバイルでのタッチ（pinch zoom）操作の使い心地
- [ ] 音と映像の頭出し精度（現状 8.8 Hz をだいたい合わせているだけ）
- [ ] アクセシビリティ・SEO（`useSeoMeta` は最小限）

短いブランチを切るより、`pages/` 配下に新規ビューを追加して試す方が回しやすい設計になっている。

---

## 作業時の注意

- **コミットメッセージ・コードコメントは英語**（`.cursorrules`）
- インデントは **タブ**（`.editorconfig`）、Prettier 設定: `singleQuote, bracketSpacing:false, semi:false, trailingComma:es5`
- パッケージマネージャは **yarn**（npm / pnpm を混ぜない）
- Stylus は CSS の `min()` / `max()` を**自前の関数として評価してしまう**。`min(var(--a), 86vw)` は `var()` と長さを比較できず、エラーも出さずに片方を選ぶ（実際 `--title-width` が `86vw` に化けた）。`unquote('min(var(--a), 86vw)')` で囲むか、`calc()` を挟んで素通しさせること
- `dist/` は `.output/public` へのシンボリックリンクなので消さない
- `public/sprites/*.mp4` を差し替えるときは After Effects プロジェクト（`../osaka_expo_collaborative/osaka-expo-anim-residency-collab.aep`）から書き出すワークフローに従う。**3×2 グリッド・8 frames/cell** の規約を絶対に崩さない（崩すならシェーダ側 `tile.frag` の `vec2(3.0, 2.0)` と offset 計算を併せて変える）
- ステップのテンポは固定周波数ではなく**拍グリッド**（`utils/beats.ts`）駆動。AE で手打ちしたマーカー → `scripts/export-beat-markers.jsx` で JSON 書き出し → `scripts/build-beats.py`（平滑化 `--smooth`・スイング保存 `--swing`・全体オフセット `--offset`、**初拍は常にアンカー**）で生成する。実行時は `useKawachiAudio` の `elapsed()`（AudioContext の時計、単調増加）だけを時計として、ターン t = `BEAT_TIMES[t]`..`[t+1]` に 8 コマを等分配置。初回パス 0..duration と、以降のループ区間 `[loopStart, duration)` の 2 本のタイムラインを持つ（マーカーはループ跨ぎ分まで打たれている前提）
