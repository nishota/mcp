#!/usr/bin/env node
// ===========================================================================
// Poi MCP サーバー
// ---------------------------------------------------------------------------
// Poi の外部公開 API（/api/v1/upload.php, /api/v1/issue-free.php）を MCP ツール
// として公開する。対応 LLM クライアント（Claude Code / Claude Desktop 等）から、
// ファイルのアップロードや無料ライセンスキーの発行を「ツール」として呼び出せる。
//
// 設定（環境変数）:
//   POI_BASE_URL        Poi のベース URL（既定 https://poi-plane.com）
//   POI_API_KEY         アップロード用 API キー（マスターキー or ライセンスキー LIC-…）
//   POI_ISSUE_PASSWORD  無料キー発行の発行パスワード
//
// 通信は stdio（標準入出力）。stdout は JSON-RPC 専用なので、ログは stderr に出す。
// ===========================================================================

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { basename, join } from 'node:path'

const BASE_URL = (process.env.POI_BASE_URL || 'https://poi-plane.com').replace(/\/+$/, '')
const API_KEY = process.env.POI_API_KEY || ''
const ISSUE_PASSWORD = process.env.POI_ISSUE_PASSWORD || ''

/** ファイル名の拡張子から Content-Type を推定する（種別判定はサーバ側が拡張子で行う）。 */
function guessContentType(name) {
  const n = name.toLowerCase()
  if (n.endsWith('.zip')) return 'application/zip'
  if (n.endsWith('.html') || n.endsWith('.htm')) return 'text/html'
  if (n.endsWith('.md') || n.endsWith('.markdown')) return 'text/markdown'
  return 'application/octet-stream'
}

/** Content-Disposition ヘッダから保存ファイル名を取り出す（filename* を優先）。 */
function contentDispositionName(cd) {
  if (!cd) return ''
  // filename*=UTF-8''<percent-encoded>（RFC 5987）を優先
  const star = cd.match(/filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i)
  if (star) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ''))
    } catch {
      /* パーセントデコードに失敗したら plain の filename にフォールバック */
    }
  }
  const plain = cd.match(/filename\s*=\s*"?([^";]+)"?/i)
  return plain ? plain[1].trim() : ''
}

function okJson(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
}
function errText(msg) {
  return { content: [{ type: 'text', text: msg }], isError: true }
}

const server = new McpServer({ name: 'poi', version: '1.0.0' })

server.registerTool(
  'poi_upload',
  {
    title: 'Poi: ファイルをアップロードして公開 URL を発行',
    description:
      'ローカルファイル(path) か、テキスト内容(content + filename) をアップロードし、公開 URL を発行します。' +
      '対応形式は .zip / .html・.htm / .md・.markdown。公開ページは 7 日で自動失効します。',
    inputSchema: {
      path: z.string().optional().describe('アップロードするローカルファイルの絶対/相対パス'),
      content: z.string().optional().describe('テキストを直接アップロードする場合の本文（filename 必須）'),
      filename: z.string().optional().describe('content を使う場合のファイル名（例: page.html, note.md）'),
      apiKey: z.string().optional().describe('API キー（未指定なら環境変数 POI_API_KEY を使用）'),
    },
  },
  async ({ path, content, filename, apiKey }) => {
    const key = apiKey || API_KEY
    if (!key) {
      return errText('API キーが未設定です。環境変数 POI_API_KEY か apiKey 引数でライセンスキー（LIC-…）等を渡してください。')
    }

    let bytes
    let name
    if (path) {
      try {
        bytes = await readFile(path)
      } catch (e) {
        return errText(`ファイルを読めません: ${e.message}`)
      }
      name = filename || basename(path)
    } else if (content != null) {
      if (!filename) return errText('content を使う場合は filename が必要です（拡張子で種別判定します）。')
      bytes = Buffer.from(content, 'utf8')
      name = filename
    } else {
      return errText('path か content(+filename) のどちらかを指定してください。')
    }

    const form = new FormData()
    form.append('file', new Blob([bytes], { type: guessContentType(name) }), name)

    let res
    try {
      res = await fetch(`${BASE_URL}/api/v1/upload.php`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}` },
        body: form,
      })
    } catch (e) {
      return errText(`リクエストに失敗しました: ${e.message}`)
    }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return errText(`アップロード失敗 (HTTP ${res.status}): ${JSON.stringify(data)}`)
    }
    return okJson(data)
  },
)

server.registerTool(
  'poi_issue_free_license',
  {
    title: 'Poi: 無料ライセンスキーを発行',
    description:
      '発行パスワードを使って無料ライセンスキー（LIC-…, 1 か月有効）を発行します。' +
      '発行されたキーは poi_upload の apiKey（または環境変数 POI_API_KEY）に使えます。',
    inputSchema: {
      password: z.string().optional().describe('発行パスワード（未指定なら環境変数 POI_ISSUE_PASSWORD を使用）'),
    },
  },
  async ({ password }) => {
    const pw = password || ISSUE_PASSWORD
    if (!pw) {
      return errText('発行パスワードが未設定です。環境変数 POI_ISSUE_PASSWORD か password 引数で渡してください。')
    }
    let res
    try {
      res = await fetch(`${BASE_URL}/api/v1/issue-free.php`, {
        method: 'POST',
        headers: { 'X-Issue-Password': pw },
      })
    } catch (e) {
      return errText(`リクエストに失敗しました: ${e.message}`)
    }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return errText(`発行失敗 (HTTP ${res.status}): ${JSON.stringify(data)}`)
    }
    return okJson(data)
  },
)

server.registerTool(
  'poi_download',
  {
    title: 'Poi: 公開サイトをダウンロード',
    description:
      'slug を指定して公開サイトの中身をダウンロードし、ローカルに保存します。' +
      'Markdown サイトは原本の .md、それ以外（ZIP・単体 HTML から作ったサイト）はサイト全体の .zip を保存します。' +
      '認証は不要（slug を知っていれば取得可）。保存先パス・種別・サイズを返します。',
    inputSchema: {
      slug: z.string().describe('公開サイトの slug（公開 URL /s/<slug>/ の <slug> 部分）'),
      dir: z.string().optional().describe('保存先ディレクトリ（未指定ならカレントディレクトリ）'),
      filename: z.string().optional().describe('保存ファイル名（未指定ならサーバー指定の名前）'),
    },
  },
  async ({ slug, dir, filename }) => {
    const s = String(slug ?? '').trim()
    if (!s) return errText('slug を指定してください（公開 URL /s/<slug>/ の <slug> 部分）。')

    let res
    try {
      res = await fetch(`${BASE_URL}/api/v1/download.php?slug=${encodeURIComponent(s)}`)
    } catch (e) {
      return errText(`リクエストに失敗しました: ${e.message}`)
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return errText(`ダウンロード失敗 (HTTP ${res.status}): ${JSON.stringify(data)}`)
    }

    // 保存ファイル名: 引数 > Content-Disposition > <slug>.zip
    const name = filename || contentDispositionName(res.headers.get('content-disposition')) || `${s}.zip`
    const outDir = dir || process.cwd()
    const outPath = join(outDir, name)

    let bytes
    try {
      bytes = Buffer.from(await res.arrayBuffer())
      await mkdir(outDir, { recursive: true })
      await writeFile(outPath, bytes)
    } catch (e) {
      return errText(`保存に失敗しました: ${e.message}`)
    }

    return okJson({
      slug: s,
      path: outPath,
      filename: name,
      bytes: bytes.length,
      contentType: res.headers.get('content-type') || '',
    })
  },
)

server.registerTool(
  'poi_check_license',
  {
    title: 'Poi: ライセンスキーの有効性を確認',
    description:
      'ライセンスキー（LIC-…）が有効かを判定し、OK/NG（valid）と有効期限（expires_at・残り日数 days_left）を返します。' +
      'key を省略すると環境変数 POI_API_KEY を確認します。認証は不要。',
    inputSchema: {
      key: z.string().optional().describe('確認するライセンスキー（未指定なら環境変数 POI_API_KEY を使用）'),
    },
  },
  async ({ key }) => {
    const k = String(key ?? API_KEY ?? '').trim()
    if (!k) {
      return errText('確認するライセンスキーがありません。key 引数か環境変数 POI_API_KEY を指定してください。')
    }
    let res
    try {
      res = await fetch(`${BASE_URL}/api/v1/license.php?key=${encodeURIComponent(k)}`)
    } catch (e) {
      return errText(`リクエストに失敗しました: ${e.message}`)
    }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return errText(`確認失敗 (HTTP ${res.status}): ${JSON.stringify(data)}`)
    }
    return okJson(data)
  },
)

server.registerTool(
  'poi_list_comments',
  {
    title: 'Poi: サイトのコメント一覧を取得',
    description:
      'slug を指定して、公開サイトに付いた訪問者コメントを新しい順に取得します。認証は不要。',
    inputSchema: {
      slug: z.string().describe('公開サイトの slug（公開 URL /s/<slug>/ の <slug> 部分）'),
    },
  },
  async ({ slug }) => {
    const s = String(slug ?? '').trim()
    if (!s) return errText('slug を指定してください（公開 URL /s/<slug>/ の <slug> 部分）。')
    let res
    try {
      res = await fetch(`${BASE_URL}/api/v1/comments.php?slug=${encodeURIComponent(s)}`)
    } catch (e) {
      return errText(`リクエストに失敗しました: ${e.message}`)
    }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return errText(`コメント取得失敗 (HTTP ${res.status}): ${JSON.stringify(data)}`)
    }
    return okJson(data)
  },
)

server.registerTool(
  'poi_post_comment',
  {
    title: 'Poi: サイトにコメントを投稿',
    description:
      'slug を指定して、公開サイトにコメントを投稿します。author は省略可（省略時は匿名）。' +
      'body は最大 2000 文字。認証は不要。',
    inputSchema: {
      slug: z.string().describe('公開サイトの slug（公開 URL /s/<slug>/ の <slug> 部分）'),
      body: z.string().describe('コメント本文（1〜2000 文字）'),
      author: z.string().optional().describe('表示名（省略で匿名）'),
    },
  },
  async ({ slug, body, author }) => {
    const s = String(slug ?? '').trim()
    if (!s) return errText('slug を指定してください（公開 URL /s/<slug>/ の <slug> 部分）。')
    if (!String(body ?? '').trim()) return errText('body（コメント本文）を指定してください。')
    let res
    try {
      res = await fetch(`${BASE_URL}/api/v1/comments.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: s, body, author: author ?? '' }),
      })
    } catch (e) {
      return errText(`リクエストに失敗しました: ${e.message}`)
    }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return errText(`コメント投稿失敗 (HTTP ${res.status}): ${JSON.stringify(data)}`)
    }
    return okJson(data)
  },
)

const transport = new StdioServerTransport()
await server.connect(transport)
console.error(`poi-mcp connected. base=${BASE_URL} apiKey=${API_KEY ? 'set' : 'unset'} issuePw=${ISSUE_PASSWORD ? 'set' : 'unset'}`)
