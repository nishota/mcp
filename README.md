# Poi MCP サーバー

Poi の外部公開 API を **MCP（Model Context Protocol）ツール**として公開するサーバーです。
対応する LLM クライアント（Claude Code / Claude Desktop など）から、ファイルのアップロード・
ダウンロード、コメントの取得・投稿、無料ライセンスキーの発行を「ツール」として呼び出せます。

内部では Poi の公開 API を叩きます:

- `poi_upload` → `POST /api/v1/upload.php`
- `poi_download` → `GET /api/v1/download.php`
- `poi_check_license` → `GET /api/v1/license.php`
- `poi_list_comments` → `GET /api/v1/comments.php`
- `poi_post_comment` → `POST /api/v1/comments.php`
- `poi_issue_free_license` → `POST /api/v1/issue-free.php`

## ツール

| ツール | 引数 | 説明 |
| --- | --- | --- |
| `poi_upload` | `path`（ローカルファイル）／ `content` + `filename`（テキスト直指定）／ `apiKey`（任意） | ファイルをアップロードして公開 URL を返す。対応形式 `.zip` / `.html`・`.htm` / `.md`・`.markdown`。 |
| `poi_download` | `slug`（必須。公開 URL `/s/<slug>/` の部分）／ `dir`（保存先。既定はカレント）／ `filename`（任意） | 公開サイトの中身をダウンロードして保存する。Markdown サイトは原本 `.md`、それ以外はサイト全体 `.zip`。認証不要。 |
| `poi_check_license` | `key`（任意。未指定なら環境変数 `POI_API_KEY`） | ライセンスキー（`LIC-…`）が有効かを判定し、OK/NG（`valid`）と有効期限（`expires_at` / `days_left`）を返す。認証不要。 |
| `poi_list_comments` | `slug`（必須） | 公開サイトの訪問者コメントを新しい順に取得する。認証不要。 |
| `poi_post_comment` | `slug`（必須）／ `body`（必須。最大 2000 字）／ `author`（任意＝匿名） | 公開サイトにコメントを投稿する。認証不要（連投は IP 単位でレート制限＝ `429 rate_limited`）。 |
| `poi_issue_free_license` | `password`（任意。未指定なら環境変数） | 無料ライセンスキー（`LIC-…`, 1 年有効）を発行。返ったキーは `poi_upload` の `apiKey` に使える。 |

## セットアップ

npm に公開してあるので、**クローンや `npm install` は不要**です。クライアントの起動コマンドに
`npx -y poi-mcp` を指定すれば、初回に自動でダウンロードされて起動します。

- 必要なもの: **Node.js 18 以上**（`npx` が使えれば OK。`fetch` / `FormData` / `Blob` を使用）
- バージョンを固定したいときは `npx -y poi-mcp@1` のように指定します。

> ローカルで開発・改造する場合のみ、リポジトリを clone して `cd mcp && npm install`、
> 起動コマンドを `node src/index.mjs` に置き換えてください。

### 環境変数

| 変数 | 既定 | 用途 |
| --- | --- | --- |
| `POI_BASE_URL` | `https://poi-plane.com` | Poi のベース URL |
| `POI_API_KEY` | （なし） | アップロード用 API キー（マスターキー or ライセンスキー `LIC-…`） |
| `POI_ISSUE_PASSWORD` | （なし） | 無料キー発行の発行パスワード |

`POI_API_KEY` / `POI_ISSUE_PASSWORD` はツール引数（`apiKey` / `password`）で都度上書きもできます。

## クライアントへの登録

### Claude Code（CLI）

```bash
claude mcp add poi \
  --env POI_BASE_URL=https://あなたのドメイン \
  --env POI_API_KEY=LIC-XXXX-XXXX-XXXX-XXXX \
  --env POI_ISSUE_PASSWORD=発行パスワード \
  -- npx -y poi-mcp
```

### Claude Desktop / 設定ファイル（`.mcp.json` や `claude_desktop_config.json`）

```json
{
  "mcpServers": {
    "poi": {
      "command": "npx",
      "args": ["-y", "poi-mcp"],
      "env": {
        "POI_BASE_URL": "https://あなたのドメイン",
        "POI_API_KEY": "LIC-XXXX-XXXX-XXXX-XXXX",
        "POI_ISSUE_PASSWORD": "発行パスワード"
      }
    }
  }
}
```

## 動作確認（手動）

MCP Inspector で対話的に確認できます:

```bash
npx @modelcontextprotocol/inspector node src/index.mjs
```

## 使い方の例（LLM への指示）

- 「`./dist` をまとめた `site.zip` を Poi にアップロードして URL を教えて」
  → `poi_upload({ path: "./site.zip" })`
- 「この HTML を `page.html` として公開して」
  → `poi_upload({ content: "<h1>hi</h1>", filename: "page.html" })`
- 「`9KwR7jgeDfPr` を手元にダウンロードして」
  → `poi_download({ slug: "9KwR7jgeDfPr" })`（Markdown サイトは `.md`、それ以外は `.zip` を保存）
- 「このライセンスキーがまだ有効か確認して」
  → `poi_check_license({ key: "LIC-XXXX-XXXX-XXXX-XXXX" })` → `{ valid, expires_at, days_left, ... }`
- 「`9KwR7jgeDfPr` のコメントを一覧して」
  → `poi_list_comments({ slug: "9KwR7jgeDfPr" })`
- 「`9KwR7jgeDfPr` に『いいね！』とコメントして」
  → `poi_post_comment({ slug: "9KwR7jgeDfPr", body: "いいね！" })`（`author` 省略で匿名）
- 「アップロード用の無料キーを取って」
  → `poi_issue_free_license()`（環境変数の発行パスワードを使用）

> API キー・発行パスワードは秘密情報です。共有環境では環境変数で渡し、ログや会話に残さないよう注意してください。

## 公開（メンテナ向け）

`npx -y poi-mcp` を成立させるには、この `mcp/` を npm に公開します。

```bash
cd mcp
npm login
npm version patch        # 必要に応じて版を上げる
npm publish --access public
```

- パッケージ名 `poi-mcp` が取得済みの場合は、`package.json` の `name` をスコープ付き
  （例 `@あなた/poi-mcp`）に変え、README とドキュメントの `poi-mcp` も読み替えてください。
- 公開されるのは `files`（`src` と `README.md`）のみです。`node_modules` は含まれません。
