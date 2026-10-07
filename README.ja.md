<h1 align="center">Leko</h1>

<p align="center"><strong>クリックできるスポットライト</strong></p>

<p align="center">
  スムーズなチュートリアル体験を構築しましょう。<br>
  Leko ならアプリの操作をステップに組み込むことが可能です。<br>
  邪魔になるレイヤー、スクロールのちらつきはありません。そして、ゼロ依存です。
</p>

---

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

インストール:

```sh
npm install @annetaan/leko
```

[Getting started](https://annetaan.github.io/leko/getting-started/) では、空のViteプロジェクトからツアーを画面に出すまでを案内しています。
ツアーが耐えなければならない状況を試すには、このリポジトリをクローンして `pnpm dev` を実行してください。
[`examples/sandbox/`](examples/sandbox/) にその状況が揃っていて、1つずつ自分で操作できます。

以下は簡単なLekoの導入例です。

```ts
import { createLeko, type LekoStory } from '@annetaan/leko'
import '@annetaan/leko/leko.css'

export const leko = createLeko()

// 型注釈ではなく `satisfies`。公開型に対して検査しつつ `awaits` は書いた
// リテラルのまま残るので、打ち間違いはその行で報告されます。
export const firstOrder = {
  id: 'first-order',
  steps: [
    {
      id: 'intro',
      target: '#order-form',
      message: 'この商品を注文しましょう',
    },
    {
      id: 'enter-quantity',
      target: { elements: 'input[name="quantity"]', interactive: true },
      message: '個数として 3 と入力してください',
      validate: (el) => (el as HTMLInputElement).value.trim() === '3',
      error: '3が入力されていません。入力値を確認してください。',
    },
    {
      id: 'save',
      target: [{ elements: 'button[type="submit"]', interactive: true }, '#tax', '#total'],
      message: '「購入する」をクリックしてください',
      awaits: 'order-saved',
    },
    {
      id: 'success',
      target: '#snack-bar',
      message: '注文完了です。お疲れ様でした🎉',
    },
  ],
} satisfies LekoStory

leko.start(firstOrder)
```

このストーリーの`save`ステップは `order-saved` を待っています。
アプリが伝えるのは「次へ進め」ではなく「**これが起きた**」です。

```ts
async function onOrderSubmit() {
  await api.createOrder(form)
  leko.reached('order-saved') // 購入処理が完了したことを Leko に伝える
}
```

この 1 行は「操作完了の証跡として使えそうな場所」へ先に書いておけます。
ストーリーは好きなだけ書けて、走っているストーリーの現在ステップがその名前を
宣言していれば進み、していなければ何も起きません。呼び出し側がどのストーリー
から使われるかを意識する必要はありません。

### 長い 1 本より、短いストーリーを何本か

戻るボタンはありません。`start()` はストーリーそのものだけを取ります。
ストーリーは最初のステップから前へ進むか、止まるかのどちらかです。

機能不足に見えますが、これは選択です。ステップはたいていアプリが報告する何かを
待っていて、注文が保存された後に「保存された」ともう一度報告されることはないので、
そのステップに立ち直したツアーは永遠に待ち続けます。どの信号が二度起こりうるかを
Leko は知りようがありません。ステップが残した状態を取り消せるアプリも多くありません。

なので 4 ステップ程度を目安にしてください。もう一度走らせても数秒で、ステップ 3 を
読み違えた人が払うのはその数秒です。20 ステップになると戻るボタンが欲しくなり、
それは分割の合図です。2 つの経路が共有する部分も、両者が指す 1 ステップではなく
ストーリーにします。理由は [DESIGN.md](DESIGN.md#a-story-is-atomic-and-stories-are-short) に書いてあります。

`target` はリストで、その要素 1 つが穴 1 つになります。要素を `{ elements: [...] }` のリージョンで書くと、
その要素どうしは union されて 1 つの穴になります。`target: { elements: ['#label', '#input'] }` は
ラベルと入力欄とその間をまとめて 1 つの穴にします。

穴は既定では「見えるが触れない」状態で、最初のリージョンに `interactive: true` と書いたステップだけが
下のページにポインタを渡します。ツアーのほとんどのステップは画面にあるものを説明する
ためのもので、そこをクリックされると次のステップが指すページから離れてしまうからです。
使用できるオプションは [`packages/types/src/types.ts`](packages/types/src/types.ts) に、各フィールドの隣に書いてあります。

## 他のライブラリーと比較したLekoの強み

**直接的なインタラクション。** ステップのリージョンに `interactive` を付けると、Lekoの要素が
ターゲットの上に配置されることは一切なく、透明な要素でさえも例外ではありません。
Lekoはオーバーレイに穴を開けるので、クリック、フォーカス、キー操作、ホイール操作は
すべて、その下の要素にそのまま届きます。

それ以外のステップの穴は「見えるが触れない」状態になります。ツアーのステップの
ほとんどはそれで足ります。

**フレームごとの位置計算が不要。** Lekoはアプリの挙動を邪魔せずに滑らかに演出します。もしユーザーが画面をスクロールさせてもパフォーマンスに負荷を与えない設計です。

**アプリがステートマシンを管理します。** `leko.reached('order-saved')` が非常に強力です。
API呼び出しが解決した後、バリデーションに合格した後など、確実なタイミングでステップを次に進めることができます。DOMイベントが発生して「うまくいくことを願う」ような不確実な方法は捨てて構いません。誰も待っていない呼び出しは、エラーにも警告にもならず、ただ何も起こりません。つまりアプリ開発者は呼び出し箇所において「今ツアーしているか？」といったことを考慮する必要はなく、ツアーが一切走らないビルドにもこの行をそのまま残しておけます。

**依存ゼロ。** コア部分は純粋な TypeScript です。

---

## この先は英語版へ

ここから先は **[英語版の README](README.md)** にあります。仕様の正は英語版です。

| | |
| --- | --- |
| [Browser support](README.md#browser-support) | 必要な CSS 機能と、無い場合の振る舞い |
| [About the name](README.md#about-the-name) | Leko という名前の由来 |
| [DESIGN.md](DESIGN.md) | なぜこの形なのか。規則ごとに、そうさせたブラウザの挙動が併記してあります |
| [`spike/`](spike/) | その根拠。Leko もビルドも使わない単体ページで、開けば挙動が見えます |
| [`examples/sandbox/`](examples/sandbox/) | ツアーが耐えなければならない状況を、1 ケースずつ |
| [CONTRIBUTING.md](CONTRIBUTING.md) | セットアップと、改善に見えて改善ではない変更の一覧 |

## ライセンス

[MIT](LICENSE) © [Annetaan Inc.](https://github.com/annetaan)
