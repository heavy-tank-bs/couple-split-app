# 二人暮らし家計シェア

2人暮らしの食費・生活費について、支払い担当、金額、負担割合を登録し、月ごとの精算額を確認するための静的Webアプリです。

## 使い方

1. `index.html` をブラウザで開きます。
2. 最初に「支払い担当」で同居メンバーと通常の負担割合を登録します。
3. 「支出登録」で項目、値段、支払い担当を入力します。
4. 月別画面で、誰が誰へいくら渡すか、負担予定と支払い実績、カテゴリ別金額を確認します。

## GitHub JSON連携

GitHub上のJSONを最新データとして使う場合は、アプリの「データ同期」に以下を入力します。

- Owner
- Repository
- Branch
- JSON path 例: `data/split-data.json`
- GitHub token

公開リポジトリの読み込みだけならtokenなしでも利用できます。GitHubへ保存する場合は、対象リポジトリのContents read/write権限を持つFine-grained personal access tokenが必要です。tokenはlocalStorageには保存しません。

保存先JSONは `data/split-data.json` と同じ構造です。
