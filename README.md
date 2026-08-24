<div align="center">

![Animondo](public/ogp.jpg)

# Animondo | アニm音頭

**[Play / 再生する](https://x.baku89.com/animondo)** · **[Watch on YouTube / YouTube で観る](https://www.youtube.com/watch?v=3sHs7mxLkBU)**

</div>

Animondo is an animated bon-odori born from the Osaka Expo 2025 EU–Japan Animation Residency. Hand-drawn characters by the residency artists dance together to the rhythm of Kawachi Ondo. It was made as a memento of nearly a month of exchange.

Animondo は、大阪・関西万博 2025 EU–日本 アニメーションレジデンシーから生まれた、アニメーションの盆踊りです。参加作家たちが手描きしたキャラクターが、河内音頭に合わせて踊り続けます。1 ヶ月近くにわたる交流の記念としてつくりました。

## Residency artists / 参加作家

Baku Hashimoto (橋本麦) · Edmunds Jansons · Honami Yano (矢野ほなみ) · Laura Gonçalves · Lucija Mrzljak · Masa Kudo (工藤雅) · Noémie Marsily · Sander Joon · Shinobu Soejima (副島しのぶ) · Sumito Sakakibara (榊原澄人)

**Music / 音楽**: Kawachi-ondo — Yayoi-kai (弥生会) and Teppou Toramaru (鉄砲虎丸)

## Development / 開発

Nuxt 4 (SPA) + WebGL ([regl](https://github.com/regl-project/regl)) + WebCodecs. Architecture notes live in [CLAUDE.md](CLAUDE.md). / 構成の詳細は [CLAUDE.md](CLAUDE.md) を参照。

```sh
yarn install
yarn dev       # dev server (visible on the LAN)
yarn generate  # static site into .output/public
```

## License / ライセンス

The source code is released under the [MIT License](LICENSE). The artists' hand-drawn animation materials (`public/sprites*`, `public/works`) and the recorded music (`public/kawachiondo_loop.*`) are **not** covered by it — all rights to those remain with their artists and performers.

ソースコードは [MIT ライセンス](LICENSE)で公開しています。各作家の手描きアニメーション素材(`public/sprites*`、`public/works`)および音源(`public/kawachiondo_loop.*`)はその対象外で、権利は各作家・演者に帰属します。

---

In the framework of the Osaka Expo 2025 EU–Japan Animation Residency
Supported by the European Union
