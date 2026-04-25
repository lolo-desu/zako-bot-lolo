import { randomUUID } from 'node:crypto'
import { chromium } from 'playwright-core'
import type { LLMTool, ToolExecutionResult } from '@zakobot/shared'
import { ensureDirectory, getGeneratedImagesDir, getZakobotHome, resolveZakobotPath } from '../../runtime/paths.js'

const CHROMIUM_EXECUTABLE = '/usr/bin/chromium'
const MAX_MARKDOWN_LENGTH = 12_000
const MAX_COLUMNS = 8
const MAX_ROWS = 40
const MAX_CELL_CHARS = 160

interface ParsedMarkdownTable {
  headers: string[]
  rows: string[][]
}

export function createMarkdownTableImageTool(): LLMTool {
  return {
    name: 'render_markdown_table_image',
    description: 'Render a markdown table into a minimal PNG image for sharing in Discord.',
    instructions: [
      '当用户明确要求把 Markdown 表格导出成图片，或需要在 Discord 中发送简约表格图片时，使用 render_markdown_table_image。',
      'markdown 参数必须是标准管道表格（包含表头、分隔线和数据行）。',
      '优先输出简洁、可读、列数适中的表格；大段说明文字不要塞进单元格。',
    ].join('\n'),
    parameters: {
      type: 'object',
      properties: {
        markdown: {
          type: 'string',
          description: 'Markdown pipe table content to render.',
        },
        title: {
          type: 'string',
          description: 'Optional title shown above the table.',
        },
      },
      required: ['markdown'],
      additionalProperties: false,
    },
    execute: async (args) => renderMarkdownTableImage(args),
  }
}

async function renderMarkdownTableImage(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  const markdown = getMarkdown(args.markdown)
  const title = typeof args.title === 'string' ? args.title.trim().slice(0, 80) : ''
  const table = parseMarkdownTable(markdown)
  const outputDir = ensureDirectory(getGeneratedImagesDir(getZakobotHome()))
  const fileName = `table-${randomUUID()}.png`
  const filePath = resolveZakobotPath(outputDir, fileName)
  const browser = await chromium.launch({
    executablePath: CHROMIUM_EXECUTABLE,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })

  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } })
    await page.setContent(buildTableHtml(table, title), { waitUntil: 'load' })
    const capture = page.locator('#capture')
    await capture.screenshot({ path: filePath, type: 'png' })
  }
  finally {
    await browser.close()
  }

  return {
    content: `Markdown 表格图片已生成，将以 PNG 形式发送给用户。标题：${title || '未命名表格'}；列数：${table.headers.length}；行数：${table.rows.length}。`,
    artifacts: [{
      kind: 'image',
      filePath,
      fileName,
      mimeType: 'image/png',
      alt: title || 'Markdown 表格图片',
    }],
  }
}

function getMarkdown(value: unknown) {
  if (typeof value !== 'string') {
    throw new Error('markdown is required')
  }

  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error('markdown is required')
  }

  if (trimmed.length > MAX_MARKDOWN_LENGTH) {
    throw new Error(`markdown is too long (limit ${MAX_MARKDOWN_LENGTH} chars)`)
  }

  return trimmed
}

function parseMarkdownTable(markdown: string): ParsedMarkdownTable {
  const lines = markdown
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)

  if (lines.length < 2) {
    throw new Error('markdown table must include a header row and separator row')
  }

  const headerCells = parseRow(lines[0])
  const separatorCells = parseRow(lines[1])

  if (!headerCells.length || headerCells.length !== separatorCells.length) {
    throw new Error('markdown table header and separator column counts must match')
  }

  if (headerCells.length > MAX_COLUMNS) {
    throw new Error(`markdown table supports up to ${MAX_COLUMNS} columns`)
  }

  if (!separatorCells.every(isSeparatorCell)) {
    throw new Error('markdown table separator row is invalid')
  }

  const rows = lines.slice(2).map(parseRow)
  if (!rows.length) {
    throw new Error('markdown table must include at least one data row')
  }

  if (rows.length > MAX_ROWS) {
    throw new Error(`markdown table supports up to ${MAX_ROWS} data rows`)
  }

  for (const row of rows) {
    if (row.length !== headerCells.length) {
      throw new Error('all markdown table rows must match the header column count')
    }
  }

  return {
    headers: headerCells.map(cell => normalizeCell(cell, true)),
    rows: rows.map(row => row.map(cell => normalizeCell(cell, false))),
  }
}

function parseRow(line: string) {
  const normalized = line.startsWith('|') ? line.slice(1) : line
  const trimmed = normalized.endsWith('|') ? normalized.slice(0, -1) : normalized
  return trimmed.split('|').map(cell => cell.trim())
}

function isSeparatorCell(cell: string) {
  return /^:?-{3,}:?$/.test(cell)
}

function normalizeCell(value: string, isHeader: boolean) {
  const collapsed = value.replace(/\s+/g, ' ').trim()
  if (!collapsed) {
    return isHeader ? '未命名列' : '—'
  }

  return collapsed.slice(0, MAX_CELL_CHARS)
}

function buildTableHtml(table: ParsedMarkdownTable, title: string) {
  const titleBlock = title
    ? `<header><h1>${escapeHtml(title)}</h1></header>`
    : ''

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <style>
      :root {
        color-scheme: light;
        font-family: Inter, "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 24px;
        background: #f5f7fb;
        color: #111827;
      }
      #capture {
        display: inline-block;
        min-width: 520px;
        max-width: 1400px;
        background: #ffffff;
        border: 1px solid #dbe2ea;
        border-radius: 20px;
        box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
        overflow: hidden;
      }
      header {
        padding: 20px 24px 0;
      }
      h1 {
        margin: 0;
        font-size: 22px;
        line-height: 1.3;
        font-weight: 700;
        letter-spacing: -0.02em;
      }
      .table-wrap {
        padding: ${title ? '16px 20px 20px' : '20px'};
      }
      table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
      }
      thead th {
        background: #eef2f7;
        color: #334155;
        font-size: 13px;
        font-weight: 700;
        text-align: left;
        letter-spacing: 0.02em;
      }
      th, td {
        padding: 12px 14px;
        border-bottom: 1px solid #e5e7eb;
        vertical-align: top;
        word-break: break-word;
      }
      tbody td {
        font-size: 14px;
        line-height: 1.5;
        color: #111827;
      }
      tbody tr:nth-child(even) td {
        background: #fafbfc;
      }
      tbody tr:last-child td {
        border-bottom: none;
      }
    </style>
  </head>
  <body>
    <div id="capture">
      ${titleBlock}
      <div class="table-wrap">
        <table>
          <thead>
            <tr>${table.headers.map(cell => `<th>${escapeHtml(cell)}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${table.rows.map(row => `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  </body>
</html>`
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
