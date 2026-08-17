# CLAUDE.md — Animondo（アニ音頭）

このリポジトリの構造・設計思想・運用ルールを、Claude / 他LLM が読んで作業しやすい形でまとめたメモ。**日本語で書かれているのは意図的なもの**（コードコメント・コミットメッセージは英語のままにする — `.cursorrules` 参照）。

---

## プロジェクト概要

EU–日本 アニメーション・レジデンシー（大阪万博 2025）の共同制作プロジェクト。8 人の作家が同じテンプレートに従って手描きアニメーション素材を提出し、それらをセル・オートマトン的に組み合わせて「アニメーションの音頭（=Animondo）」を生成する Web 作品。

- 公開タイトル: **Animondo**
- 公開先: <https://x.baku89.com/animondo>（baseURL: `/animondo/`）
- リポジトリ: `baku89/animondo`（private）
- BGM: `public/kawachiondo.mp3`（河内音頭）— 8.8 fps のステップとほぼ同期させている
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
- WebGL: regl（`composables/useRegl.ts`）
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
│   ├── useRegl.ts               # regl の初期化・RAFループ・リサイズ
│   ├── useVideoTexture.ts       # 1 本の <video> をテクスチャ化、setFrame(n) でシーク
│   ├── useVideoTextureArray.ts  # 上の N 本まとめ版
│   ├── useKawachiAudio.ts       # kawachiondo.mp3 の再生開始ゲート
│   └── useZUI.ts                # ピンチ/ドラッグ/ホイールズーム（index.vue 専用）
├── utils/
│   ├── tile.ts                  # ★ Tile / Direction enum、TILE_DISPLAY_TABLE、エンコード
│   ├── TileMap.ts               # ★ オートマトン本体（状態保持＋シェーダ用テクスチャ更新）
│   ├── patterns.ts              # ★ パターン辞書（clockwise / gather / scatter ほか）
│   ├── Array2D.ts               # トロイダル 2D 配列ユーティリティ
│   └── randomInt.ts
├── public/
│   ├── kawachiondo.mp3          # BGM
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

### CPU→GPU のステート受け渡し（`TileMap.texture`）

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

---

## エントリポイント

### `pages/index.vue` — 本番ビュー（インタラクティブ）
- 画面ぴったりにキャンバスを敷く、`useZUI` でズーム/パン操作可能
- `Tap To Start` ボタンで `useKawachiAudio.start()` → 音声再生開始＋ループ駆動
- `useIntervalFn(..., 1000 / 8.8)` で常時更新（RAF はキャンバスサイズに同期）
- パターンシーケンスはここで完結している（`tileMap.setMovePattern(function*() { ... })`）

> 過去にあった `pages/export.vue`（PNG 連番書き出し用ビュー）は現在 `video-export` ブランチに退避してある。再開したい場合はそちらを参照。

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
- **配信パス**: `useVideoTexture` の `videoElement.src = '/animondo/' + videoSrc` で baseURL を直書きしている。dev サーバ（baseURL なし）でも本番（baseURL=`/animondo/`）でも同じ URL を使うために固定。**baseURL を変える場合はここも要修正**

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

- [ ] ビデオ 8 本を並列 seek している部分のパフォーマンス改善（`useVideoTexture.setFrame` の `requestAnimationFrame` 待ちが直列化要因）
- [ ] スプライトのフォーマット（mp4 → WebP アニメ or 静止画スプライトシート）の検討
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
- `dist/` は `.output/public` へのシンボリックリンクなので消さない
- `public/sprites/*.mp4` を差し替えるときは After Effects プロジェクト（`../osaka_expo_collaborative/osaka-expo-anim-residency-collab.aep`）から書き出すワークフローに従う。**3×2 グリッド・8 frames/cell** の規約を絶対に崩さない（崩すならシェーダ側 `tile.frag` の `vec2(3.0, 2.0)` と offset 計算を併せて変える）
- ステップ周波数を変えたい場合は `pages/*.vue` 側の `useIntervalFn(..., 1000 / 8.8)` と `currentFrame % 8` の 2 か所をセットで触る
