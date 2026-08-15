<h1 align="center">Leko</h1>

<p align="center"><strong>クリックできるスポットライト</strong></p>

<p align="center">
  スムーズなチュートリアル体験を構築しましょう。<br>
  Leko ならアプリの操作をステップに組み込むことが可能です。<br>
  邪魔になるレイヤー、スクロールのちらつきはありません。そして、ゼロ依存です。
</p>

---

> [!WARNING]
> **Lekoはまだリリースされていません。** このリポジトリは現在活発に開発が進められており、
> APIは予告なく変更される可能性があります。本番環境での使用は避けてください。

## なぜ新しいツアーライブラリが必要なのか？

どのツアーライブラリも、強調表示対象の上に透明なレイヤーを重ねます。
そのレイヤーがクリックやキー入力を遮ってしまうため、せいぜい
ボタンを「指し示して」「ここをクリック」と言うことしかできません。ユーザーはただ見ているだけで、何も頭に残りません。

Lekoのスポットライトはユーザーの操作を邪魔しません。Lekoは演出のためのオーバーレイに穴を開けるからです。

Lekoのオーバーレイは、ハイライトされた要素への操作を邪魔しないため、ユーザーは実際のボタンをクリックし、実際の入力欄に入力できます。そしてアプリケーションへの操作成功をステップに組み込んだツアーを構成することができます。

```
Other libraries          Leko
─────────────────        ─────────────────
Show  → user watches     Do  → user performs
```

## 使い方

Lekoはまだnpmには登録されていません。
今すぐ動作を確認するには、このリポジトリをクローンして `pnpm dev` を実行してください。

以下は簡単なLekoの導入例です。

```ts
import { createLeko } from '@annetaan/leko'
import '@annetaan/leko/leko.css'

export const leko = createLeko({
  steps: [
    {
      id: 'intro',
      target: '#order-form',
      message: 'この商品を注文しましょう',
    },
    {
      id: 'enter-quantity',
      target: 'input[name="quantity"]',
      message: '個数として 3 と入力してください',
      validate: (el) => (el as HTMLInputElement).value.trim() === '3',
      onValidationError: (_el, utils) => {
        utils.shake()
        utils.setError('3が入力されていません。入力値を確認してください。')
      },
    },
    {
      id: 'save',
      target: 'button[type="submit"]',
      related: ['#tax', '#total'],
      message: '「購入する」をクリックしてください',
      awaits: 'order-saved',
    },
    {
      id: 'success',
      target: '#snack-bar',
      message: '注文完了です。お疲れ様でした🎉',
    },
  ],
})

leko.start()
```

このシナリオの`save`ステップは `order-saved` を待っています。
アプリが伝えるのは「次へ進め」ではなく「**これが起きた**」です。

```ts
async function onOrderSubmit() {
  await api.createOrder(form)
  leko.reached('order-saved') // 購入処理が完了したことを Leko に伝える
}
```

スポットライトの対象を複数要素 (`target: [a, b]`) にすることも可能です。
また操作可能なスポットライトとは別の領域へ (`related: [...]`) スポットライトを向けることもできます。
使用できるオプションは [`packages/core/src/types.ts`](packages/core/src/types.ts) に、各フィールドの隣に書いてあります。

## 他のライブラリーと比較したLekoの強み

**直接的なインタラクション。** Lekoの要素は、ターゲットの上に配置されることが一切なく、
透明な要素でさえも例外ではありません。Lekoはオーバーレイに穴を開けるので、クリック、フォーカス、キー操作、ホイール操作はすべて、その下の要素にそのまま届きます。

**フレームごとの位置計算が不要。** Lekoはアプリの挙動を邪魔せずに滑らかに演出します。もしユーザーが画面をスクロールさせてもパフォーマンスに負荷を与えない設計です。

**アプリがステートマシンを管理します。** `leko.reached('step-name')` が非常に強力です。
API呼び出しが解決した後、バリデーションに合格した後など、確実なタイミングでステップを次に進めることができます。DOMイベントが発生して「うまくいくことを願う」ような不確実な方法は捨てて構いません。またツアーが実行されていない状態でこれを呼び出しても何も起こりません。つまりアプリ開発者は呼び出し箇所において「今ツアーしているか？」といったことを考慮する必要はありません。

**依存ゼロ。** コア部分は純粋な TypeScript です。

---

## この先は英語版へ

ここから先は **[英語版の README](README.md)** にあります。仕様の正は英語版です。

| | |
| --- | --- |
| [Status](README.md#status) | どこまで動いていて、何がこれからか |
| [Browser support](README.md#browser-support) | 必要な CSS 機能と、無い場合の振る舞い |
| [About the name](README.md#about-the-name) | Leko という名前の由来 |
| [DESIGN.md](DESIGN.md) | なぜこの形なのか。規則ごとに、そうさせたブラウザの挙動が併記してあります |
| [`spike/`](spike/) | その根拠。Leko もビルドも使わない単体ページで、開けば挙動が見えます |
| [`examples/sandbox/`](examples/sandbox/) | ツアーが耐えなければならない状況を、1 ケースずつ |
| [CONTRIBUTING.md](CONTRIBUTING.md) | セットアップと、改善に見えて改善ではない変更の一覧 |

## ライセンス

[MIT](LICENSE) © [Annetaan Inc.](https://github.com/annetaan)
