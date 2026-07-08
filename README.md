# Poi MCP Server

**English** | [日本語](#poi-mcp-サーバー日本語)

A server that exposes [Poi's public API](https://poi-plane.com/api-docs.html) as **MCP (Model Context Protocol) tools**.
From compatible LLM clients (Claude Code / Claude Desktop, etc.), you can call
file upload/download, comment read/post, and free license key issuance as "tools".

## About Poi

[Poi](https://poi-plane.com/) is a simple hosting service for temporarily publishing static
web content — no server setup required. Upload a ZIP (a multi-file site), a single HTML file,
or a Markdown document, and you instantly get a public URL of the form
`https://poi-plane.com/s/<slug>/`.

- **Instant publishing** — a drag-and-drop or API upload returns a shareable URL right away.
- **Supported content** — `.zip` (a whole site), `.html`/`.htm` (a single page), and
  `.md`/`.markdown` (rendered to a styled page; the original `.md` stays downloadable).
- **Auto-expiry** — every published page is automatically deleted after **7 days**.
- **Visitor comments** — each public site has a comment area that visitors can read and post to.
- **Not indexed** — pages carry `noindex`, so search engines don't list them (but anyone who
  knows the URL can view them).
- **License keys** — uploading requires a license key (`LIC-…`). A paid key costs
  **300 JPY per year**; free keys can also be issued (see `poi_issue_free_license`).
- **Limits** — up to 200 MB and 2,000 files per upload; no server-side execution (PHP/CGI)
  and no password protection.

This MCP server lets an LLM client drive all of the above through tools.

Under the hood it calls Poi's public API:

- `poi_upload` → `POST /api/v1/upload.php`
- `poi_download` → `GET /api/v1/download.php`
- `poi_check_license` → `GET /api/v1/license.php`
- `poi_list_comments` → `GET /api/v1/comments.php`
- `poi_post_comment` → `POST /api/v1/comments.php`
- `poi_issue_free_license` → `POST /api/v1/issue-free.php`

## Tools

| Tool | Arguments | Description |
| --- | --- | --- |
| `poi_upload` | `path` (local file) / `content` + `filename` (inline text) / `apiKey` (optional) | Upload a file and return its public URL. Supported formats: `.zip` / `.html`·`.htm` / `.md`·`.markdown`. |
| `poi_download` | `slug` (required; the part of the public URL `/s/<slug>/`) / `dir` (destination; defaults to current directory) / `filename` (optional) | Download and save the contents of a public site. Markdown sites are saved as the original `.md`; everything else as a whole-site `.zip`. No authentication required. |
| `poi_check_license` | `key` (optional; falls back to env var `POI_API_KEY`) | Check whether a license key (`LIC-…`) is valid, returning OK/NG (`valid`) and expiry (`expires_at` / `days_left`). No authentication required. |
| `poi_list_comments` | `slug` (required) | Fetch a public site's visitor comments, newest first. No authentication required. |
| `poi_post_comment` | `slug` (required) / `body` (required; max 2000 chars) / `author` (optional = anonymous) | Post a comment to a public site. No authentication required (repeated posts are rate-limited per IP = `429 rate_limited`). |
| `poi_issue_free_license` | `password` (optional; falls back to env var) | Issue a free license key (`LIC-…`, valid for 1 month / 30 days). The returned key can be used as `poi_upload`'s `apiKey`. |

## Setup

It is published on npm, so **cloning or `npm install` is not required**. Just specify
`npx -y poi-mcp` as your client's launch command and it will be downloaded and started
automatically on first run.

- Requirements: **Node.js 18 or later** (`npx` is enough; uses `fetch` / `FormData` / `Blob`)
- To pin a version, specify it like `npx -y poi-mcp@1`.

> Only if you want to develop or modify it locally, clone the repository, run
> `cd mcp && npm install`, and replace the launch command with `node src/index.mjs`.

### Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `POI_BASE_URL` | `https://poi-plane.com` | Poi base URL |
| `POI_API_KEY` | (none) | **Required when using the API** (uploads). The API key for uploads (master key or license key `LIC-…`). Using the API requires a **license fee of 300 JPY per year**. |
| `POI_ISSUE_PASSWORD` | (none) | **Required when obtaining (issuing) a license key.** The issue password for the license key. |

`POI_API_KEY` / `POI_ISSUE_PASSWORD` can also be overridden per call via tool arguments (`apiKey` / `password`).

## Registering with a client

### Claude Code (CLI)

```bash
claude mcp add poi \
  --env POI_BASE_URL=https://poi-plane.com \
  --env POI_API_KEY=LIC-XXXX-XXXX-XXXX-XXXX \
  --env POI_ISSUE_PASSWORD=your-issue-password \
  -- npx -y poi-mcp
```

### Claude Desktop / config file (`.mcp.json` or `claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "poi": {
      "command": "npx",
      "args": ["-y", "poi-mcp"],
      "env": {
        "POI_BASE_URL": "https://poi-plane.com",
        "POI_API_KEY": "LIC-XXXX-XXXX-XXXX-XXXX",
        "POI_ISSUE_PASSWORD": "your-issue-password"
      }
    }
  }
}
```

## Manual verification

You can check interactively with the MCP Inspector:

```bash
npx @modelcontextprotocol/inspector node src/index.mjs
```

## Usage examples (instructions to the LLM)

- "Upload `site.zip` bundling `./dist` to Poi and tell me the URL"
  → `poi_upload({ path: "./site.zip" })`
- "Publish this HTML as `page.html`"
  → `poi_upload({ content: "<h1>hi</h1>", filename: "page.html" })`
- "Download `9KwR7jgeDfPr` to my machine"
  → `poi_download({ slug: "9KwR7jgeDfPr" })` (Markdown sites save `.md`, others save `.zip`)
- "Check whether this license key is still valid"
  → `poi_check_license({ key: "LIC-XXXX-XXXX-XXXX-XXXX" })` → `{ valid, expires_at, days_left, ... }`
- "List the comments on `9KwR7jgeDfPr`"
  → `poi_list_comments({ slug: "9KwR7jgeDfPr" })`
- "Post 'Nice!' as a comment on `9KwR7jgeDfPr`"
  → `poi_post_comment({ slug: "9KwR7jgeDfPr", body: "Nice!" })` (omit `author` for anonymous)
- "Get a free key for uploading"
  → `poi_issue_free_license()` (uses the issue password from env vars)

> API keys and issue passwords are secrets. In shared environments, pass them via environment
> variables and be careful not to leave them in logs or conversations.

## Publishing (for maintainers)

To make `npx -y poi-mcp` work, publish this `mcp/` to npm.

```bash
cd mcp
npm login
npm version patch        # bump the version as needed
npm publish --access public
```

- If the package name `poi-mcp` is already taken, change `name` in `package.json` to a scoped
  name (e.g. `@you/poi-mcp`), and read `poi-mcp` in the README and docs accordingly.
- Only `files` (`src` and `README.md`) are published. `node_modules` is not included.

---

# Poi MCP サーバー（日本語）

[English](#poi-mcp-server) | **日本語**

[Poiの外部公開 API](https://poi-plane.com/api-docs.html) を **MCP（Model Context Protocol）ツール**として公開するサーバーです。
対応する LLM クライアント（Claude Code / Claude Desktop など）から、ファイルのアップロード・
ダウンロード、コメントの取得・投稿、無料ライセンスキーの発行を「ツール」として呼び出せます。

## Poi とは

[Poi](https://poi-plane.com/) は、静的な Web コンテンツを手軽に一時公開できるホスティングサービスです。
サーバーの用意は不要。ZIP（複数ファイルのサイト）・単体 HTML・Markdown をアップロードすると、
`https://poi-plane.com/s/<slug>/` 形式の公開 URL がその場で発行されます。

- **すぐ公開** — ドラッグ&ドロップ、または API でアップロードすると共有 URL がすぐ返ります。
- **対応コンテンツ** — `.zip`（サイト一式）・`.html`/`.htm`（単体ページ）・`.md`/`.markdown`
  （整形済みページとして表示。原本 `.md` もダウンロード可能）。
- **自動失効** — 公開ページは **7 日で自動的に削除**されます。
- **訪問者コメント** — 各公開サイトに、訪問者が読み書きできるコメント欄があります。
- **検索非対象** — ページには `noindex` が付き、検索エンジンには載りません（URL を知っていれば誰でも閲覧可）。
- **ライセンスキー** — アップロードにはライセンスキー（`LIC-…`）が必要です。有料キーは
  **1 年間 300 円**、無料キーの発行も可能です（`poi_issue_free_license` を参照）。
- **上限** — 1 回のアップロードで最大 200 MB・2,000 ファイル。サーバー実行（PHP/CGI）やパスワード保護は非対応。

この MCP サーバーは、上記のすべてを LLM クライアントからツールとして操作できるようにします。

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
| `poi_issue_free_license` | `password`（任意。未指定なら環境変数） | 無料ライセンスキー（`LIC-…`, 1 か月＝30 日有効）を発行。返ったキーは `poi_upload` の `apiKey` に使える。 |

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
| `POI_API_KEY` | （なし） | **API 利用時に必要**なアップロード用 API キー（マスターキー or ライセンスキー `LIC-…`）。API の利用には **1 年間 300 円のライセンス料**が必要です。 |
| `POI_ISSUE_PASSWORD` | （なし） | **ライセンスキーを取得（発行）するときに必要**な発行パスワード |

`POI_API_KEY` / `POI_ISSUE_PASSWORD` はツール引数（`apiKey` / `password`）で都度上書きもできます。

## クライアントへの登録

### Claude Code（CLI）

```bash
claude mcp add poi \
  --env POI_BASE_URL=https://poi-plane.com \
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
        "POI_BASE_URL": "https://poi-plane.com",
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
