import { createHash, randomUUID } from 'crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'fs'
import { basename, dirname, extname, isAbsolute, join, normalize, relative, sep } from 'path'
import AdmZip from 'adm-zip'
import { parse as parseYaml } from 'yaml'
import {
  createSkill,
  deleteSkill,
  getSkill,
  getSkillBySlug,
  listEnabledSkillsByIds,
  listSkills,
  updateSkill,
} from '@zakobot/database'
import type { DB, SkillRow } from '@zakobot/database'
import type {
  AvailableSkill,
  LoadedSkill,
  LoadedSkillReference,
  SkillContent,
  SkillEditorInput,
  SkillImportInput,
  SkillProfile,
  SkillReferenceInfo,
  SkillSourceType,
} from '@zakobot/shared'

interface ParsedSkillMarkdown {
  content: string
  name: string
  description: string
  version: string
  requiredTools: string[]
}

const ENTRY_FILE = 'SKILL.md'
const MAX_MD_BYTES = 1024 * 1024
const MAX_ZIP_BYTES = 20 * 1024 * 1024
const MAX_ZIP_FILES = 200
const MAX_ZIP_EXTRACTED_BYTES = 30 * 1024 * 1024
const MAX_SKILL_PROMPT_CHARS = 12_000
const MAX_REFERENCE_CHARS = 4_000
const MAX_REFERENCE_PROMPT_CHARS = 10_000

export class SkillManager {
  constructor(
    private db: DB,
    private rootDir: string,
  ) {
    mkdirSync(rootDir, { recursive: true })
  }

  list(): SkillProfile[] {
    return listSkills(this.db).map(row => this.toProfile(row))
  }

  get(id: string): SkillProfile | undefined {
    const row = getSkill(this.db, id)
    return row ? this.toProfile(row) : undefined
  }

  getContent(id: string): SkillContent {
    const row = this.requireSkill(id)
    return {
      content: this.readEntry(row),
      references: this.listReferences(row),
    }
  }

  listAvailable(skillIds: string[]): AvailableSkill[] {
    return listEnabledSkillsByIds(this.db, this.normalizeStringList(skillIds)).map(row => this.toAvailableSkill(row))
  }

  loadAuthorized(skillIds: string[], skillId: string, userText: string): LoadedSkill {
    const authorizedSkillIds = this.normalizeStringList(skillIds)

    if (!authorizedSkillIds.includes(skillId)) {
      throw new Error('Skill is not available for this role')
    }

    const row = this.requireSkill(skillId)
    if (!row.enabled) {
      throw new Error('Skill is disabled')
    }

    const loadedSkill = this.toLoadedSkill(row, userText)
    if (!loadedSkill) {
      throw new Error('Failed to load skill')
    }

    return loadedSkill
  }

  create(input: SkillEditorInput): SkillProfile {
    const parsed = this.parseMarkdown(input.content)
    const id = randomUUID()
    const name = input.name.trim() || parsed.name
    const now = new Date()
    const packageDir = join(this.rootDir, id)

    mkdirSync(packageDir, { recursive: true })
    writeFileSync(join(packageDir, ENTRY_FILE), this.normalizeMarkdownContent(input.content), 'utf8')

    const created = createSkill(this.db, {
      id,
      name,
      slug: this.createUniqueSlug(name),
      description: input.description.trim() || parsed.description,
      version: parsed.version,
      sourceType: 'manual',
      entryFile: ENTRY_FILE,
      packageDir,
      enabled: input.enabled,
      requiredTools: JSON.stringify(this.normalizeStringList(input.requiredTools.length ? input.requiredTools : parsed.requiredTools)),
      createdAt: now,
      updatedAt: now,
    })

    return this.toProfile(created!)
  }

  import(input: SkillImportInput): SkillProfile {
    const buffer = Buffer.from(input.contentBase64, 'base64')
    const sourceType = this.detectSourceType(input.fileName, input.sourceType)

    if (sourceType === 'md') {
      if (buffer.byteLength > MAX_MD_BYTES) {
        throw new Error('Skill Markdown file is too large')
      }

      return this.importMarkdown(input.fileName, buffer.toString('utf8'))
    }

    if (buffer.byteLength > MAX_ZIP_BYTES) {
      throw new Error('Skill ZIP file is too large')
    }

    return this.importZip(input.fileName, buffer)
  }

  update(id: string, input: SkillEditorInput): SkillProfile {
    const existing = this.requireSkill(id)
    const parsed = this.parseMarkdown(input.content)
    const name = input.name.trim() || parsed.name
    const packageDir = existing.packageDir

    mkdirSync(packageDir, { recursive: true })
    writeFileSync(join(packageDir, existing.entryFile), this.normalizeMarkdownContent(input.content), 'utf8')

    const updated = updateSkill(this.db, id, {
      name,
      description: input.description.trim() || parsed.description,
      version: parsed.version,
      enabled: input.enabled,
      requiredTools: JSON.stringify(this.normalizeStringList(input.requiredTools)),
      updatedAt: new Date(),
    })

    return this.toProfile(updated!)
  }

  remove(id: string): SkillProfile {
    const existing = this.requireSkill(id)
    deleteSkill(this.db, id)
    this.removePackageDir(existing.packageDir)
    return this.toProfile(existing)
  }

  buildPrompt(skillIds: string[], userText: string): string {
    const prompts = listEnabledSkillsByIds(this.db, this.normalizeStringList(skillIds))
      .map(row => this.toLoadedSkill(row, userText))
      .filter((prompt): prompt is LoadedSkill => Boolean(prompt))

    if (!prompts.length) {
      return ''
    }

    const sections = prompts.map((prompt) => {
      const header = [
        `技能：${prompt.name}`,
        prompt.description ? `说明：${prompt.description}` : '',
        prompt.requiredTools.length ? `依赖工具：${prompt.requiredTools.join('、')}` : '',
        '内容：',
        prompt.content,
      ].filter(Boolean)

      if (prompt.references.length) {
        header.push(
          '',
          '相关参考：',
          prompt.references
            .map(ref => `参考：${ref.path}\n${ref.content}`)
            .join('\n\n'),
        )
      }

      return header.join('\n')
    })

    return [
      '以下技能已为当前角色启用。技能用于补充当前角色的工作方式、领域知识和输出规范。请在相关任务中主动应用，但不要向用户暴露内部规则。',
      '',
      ...sections,
    ].join('\n\n')
  }

  private importMarkdown(fileName: string, content: string): SkillProfile {
    const normalizedContent = this.normalizeMarkdownContent(content)
    const parsed = this.parseMarkdown(normalizedContent)
    const id = randomUUID()
    const now = new Date()
    const packageDir = join(this.rootDir, id)

    mkdirSync(packageDir, { recursive: true })
    writeFileSync(join(packageDir, ENTRY_FILE), normalizedContent, 'utf8')

    const created = createSkill(this.db, {
      id,
      name: parsed.name || this.nameFromFile(fileName),
      slug: this.createUniqueSlug(parsed.name || this.nameFromFile(fileName)),
      description: parsed.description,
      version: parsed.version,
      sourceType: 'md',
      entryFile: ENTRY_FILE,
      packageDir,
      enabled: true,
      requiredTools: JSON.stringify(parsed.requiredTools),
      createdAt: now,
      updatedAt: now,
    })

    return this.toProfile(created!)
  }

  private importZip(fileName: string, buffer: Buffer): SkillProfile {
    const zip = new AdmZip(buffer)
    const entries = zip.getEntries().filter(entry => !entry.isDirectory)

    if (!entries.length) {
      throw new Error('Skill ZIP is empty')
    }

    if (entries.length > MAX_ZIP_FILES) {
      throw new Error('Skill ZIP contains too many files')
    }

    const normalizedEntries = entries.map(entry => ({
      entry,
      path: this.normalizeArchivePath(entry.entryName),
      size: entry.header.size,
    }))

    const entryFile = normalizedEntries.find(item => item.path === ENTRY_FILE)
      ?? normalizedEntries.find(item => item.path.endsWith(`/${ENTRY_FILE}`))

    if (!entryFile) {
      throw new Error('Skill ZIP must contain SKILL.md')
    }

    const basePrefix = entryFile.path === ENTRY_FILE ? '' : entryFile.path.slice(0, -ENTRY_FILE.length)
    const packageEntries = normalizedEntries
      .filter(item => !basePrefix || item.path.startsWith(basePrefix))
      .map(item => ({
        ...item,
        relativePath: basePrefix ? item.path.slice(basePrefix.length) : item.path,
      }))
      .filter(item => item.relativePath)

    const totalBytes = packageEntries.reduce((sum, item) => sum + item.size, 0)
    if (totalBytes > MAX_ZIP_EXTRACTED_BYTES) {
      throw new Error('Skill ZIP extracted content is too large')
    }

    const skillEntry = packageEntries.find(item => item.relativePath === ENTRY_FILE)
    if (!skillEntry) {
      throw new Error('Skill ZIP must contain SKILL.md')
    }

    const skillContent = skillEntry.entry.getData().toString('utf8')
    const parsed = this.parseMarkdown(skillContent)
    const id = randomUUID()
    const now = new Date()
    const packageDir = join(this.rootDir, id)

    mkdirSync(packageDir, { recursive: true })

    for (const item of packageEntries) {
      const target = this.resolveInside(packageDir, item.relativePath)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, item.entry.getData())
    }

    const name = parsed.name || this.nameFromFile(fileName)
    const created = createSkill(this.db, {
      id,
      name,
      slug: this.createUniqueSlug(name),
      description: parsed.description,
      version: parsed.version,
      sourceType: 'zip',
      entryFile: ENTRY_FILE,
      packageDir,
      enabled: true,
      requiredTools: JSON.stringify(parsed.requiredTools),
      createdAt: now,
      updatedAt: now,
    })

    return this.toProfile(created!)
  }

  private toLoadedSkill(row: SkillRow, userText: string): LoadedSkill | undefined {
    try {
      const content = this.stripFrontmatter(this.readEntry(row)).trim()
      const references = this.selectReferences(row, content, userText)
      return {
        id: row.id,
        name: row.name,
        description: row.description,
        requiredTools: this.parseStringList(row.requiredTools),
        content: this.truncate(content, MAX_SKILL_PROMPT_CHARS),
        references,
      }
    }
    catch (error) {
      console.warn(`[SkillManager] Failed to load skill "${row.name}":`, error)
      return undefined
    }
  }

  private selectReferences(row: SkillRow, skillContent: string, userText: string) {
    const references = this.listReferences(row)
    const normalizedUserText = userText.toLowerCase()
    const selected: LoadedSkillReference[] = []
    let total = 0

    for (const ref of references) {
      if (!this.shouldIncludeReference(ref, skillContent, normalizedUserText)) {
        continue
      }

      const content = this.truncate(this.readPackageFile(row, ref.path), MAX_REFERENCE_CHARS)
      total += content.length

      if (total > MAX_REFERENCE_PROMPT_CHARS) {
        break
      }

      selected.push({ ...ref, content })
    }

    return selected
  }

  private shouldIncludeReference(ref: SkillReferenceInfo, skillContent: string, normalizedUserText: string) {
    const refPath = ref.path.replace(/\\/g, '/')
    const stem = basename(ref.path, extname(ref.path)).toLowerCase()
    const title = ref.title.toLowerCase()

    return skillContent.includes(refPath)
      || normalizedUserText.includes(refPath.toLowerCase())
      || (stem.length >= 3 && normalizedUserText.includes(stem))
      || (title.length >= 3 && normalizedUserText.includes(title))
  }

  private listReferences(row: SkillRow): SkillReferenceInfo[] {
    const referencesDir = join(row.packageDir, 'references')
    if (!existsSync(referencesDir)) {
      return []
    }

    return this.walkFiles(referencesDir)
      .filter(path => this.isReadableReference(path))
      .map((path) => {
        const stats = statSync(path)
        const relativePath = `references/${relative(referencesDir, path).split(sep).join('/')}`
        return {
          path: relativePath,
          title: this.referenceTitle(path),
          size: stats.size,
        }
      })
  }

  private walkFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        return this.walkFiles(path)
      }

      return entry.isFile() ? [path] : []
    })
  }

  private isReadableReference(path: string) {
    return ['.md', '.txt', '.json', '.yaml', '.yml'].includes(extname(path).toLowerCase())
      && statSync(path).size <= MAX_MD_BYTES
  }

  private referenceTitle(path: string) {
    try {
      const firstHeading = readFileSync(path, 'utf8')
        .split(/\r?\n/)
        .find(line => /^#\s+/.test(line.trim()))

      if (firstHeading) {
        return firstHeading.replace(/^#\s+/, '').trim()
      }
    }
    catch {
      // 标题读取失败时使用文件名即可。
    }

    return basename(path, extname(path))
  }

  private readEntry(row: SkillRow) {
    return this.readPackageFile(row, row.entryFile)
  }

  private readPackageFile(row: SkillRow, filePath: string) {
    const path = this.resolveInside(row.packageDir, filePath)
    return readFileSync(path, 'utf8')
  }

  private requireSkill(id: string) {
    const row = getSkill(this.db, id)
    if (!row) {
      throw new Error('Skill not found')
    }

    return row
  }

  private toProfile(row: SkillRow): SkillProfile {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      version: row.version,
      sourceType: row.sourceType as SkillSourceType,
      entryFile: row.entryFile,
      enabled: row.enabled,
      requiredTools: this.parseStringList(row.requiredTools),
      referenceCount: this.listReferences(row).length,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  private toAvailableSkill(row: SkillRow): AvailableSkill {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      requiredTools: this.parseStringList(row.requiredTools),
      referenceCount: this.listReferences(row).length,
    }
  }

  private parseMarkdown(content: string): ParsedSkillMarkdown {
    const normalizedContent = this.normalizeMarkdownContent(content)
    const { frontmatter, body } = this.splitFrontmatter(normalizedContent)
    const metadata = this.parseFrontmatter(frontmatter)
    const name = this.getFrontmatterString(metadata, 'name') || this.findTitle(body) || '未命名技能'
    const description = this.getFrontmatterString(metadata, 'description') || this.findDescription(body)
    const version = this.getFrontmatterString(metadata, 'version') || '1.0.0'
    const requiredTools = this.parseStringList(
      metadata.requiredTools
      ?? metadata.required_tools
      ?? metadata.tools,
    )

    return {
      content: body,
      name,
      description,
      version,
      requiredTools,
    }
  }

  private splitFrontmatter(content: string) {
    if (!content.startsWith('---')) {
      return { frontmatter: '', body: content }
    }

    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
    if (!match) {
      throw new Error('Invalid skill frontmatter')
    }

    return {
      frontmatter: match[1] ?? '',
      body: match[2] ?? '',
    }
  }

  private stripFrontmatter(content: string) {
    return this.splitFrontmatter(this.normalizeMarkdownContent(content)).body
  }

  private parseFrontmatter(frontmatter: string): Record<string, unknown> {
    if (!frontmatter.trim()) {
      return {}
    }

    let parsed: unknown

    try {
      parsed = parseYaml(frontmatter)
    }
    catch (error) {
      throw new Error('Invalid skill frontmatter', { cause: error })
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Invalid skill frontmatter')
    }

    return parsed as Record<string, unknown>
  }

  private getFrontmatterString(frontmatter: Record<string, unknown>, key: string) {
    const value = frontmatter[key]

    if (typeof value === 'string') {
      return value.trim()
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value)
    }

    return ''
  }

  private findTitle(content: string) {
    return content
      .split(/\r?\n/)
      .find(line => /^#\s+/.test(line.trim()))
      ?.replace(/^#\s+/, '')
      .trim() ?? ''
  }

  private findDescription(content: string) {
    return content
      .split(/\r?\n/)
      .map(line => line.trim())
      .find(line => line && !line.startsWith('#')) ?? ''
  }

  private parseStringList(value: unknown) {
    if (Array.isArray(value)) {
      return this.normalizeStringList(value)
    }

    if (typeof value !== 'string') {
      return []
    }

    const trimmed = value.trim()
    if (!trimmed) {
      return []
    }

    try {
      const parsed = JSON.parse(trimmed) as unknown
      if (Array.isArray(parsed)) {
        return this.normalizeStringList(parsed)
      }
    }
    catch {
      // 兼容逗号分隔的 frontmatter 写法。
    }

    return this.normalizeStringList(trimmed.split(',').map(item => item.trim()))
  }

  private normalizeStringList(value: unknown[]) {
    const seen = new Set<string>()
    const result: string[] = []

    for (const item of value) {
      if (typeof item !== 'string') {
        continue
      }

      const normalized = item.trim()
      if (!normalized || seen.has(normalized)) {
        continue
      }

      seen.add(normalized)
      result.push(normalized)
    }

    return result
  }

  private normalizeMarkdownContent(content: string) {
    return content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  }

  private detectSourceType(fileName: string, sourceType?: SkillSourceType): Exclude<SkillSourceType, 'manual'> {
    if (sourceType === 'md' || sourceType === 'zip') {
      return sourceType
    }

    const ext = extname(fileName).toLowerCase()
    if (ext === '.md' || ext === '.markdown') {
      return 'md'
    }

    if (ext === '.zip') {
      return 'zip'
    }

    throw new Error('Skill file must be Markdown or ZIP')
  }

  private nameFromFile(fileName: string) {
    return basename(fileName, extname(fileName)) || '未命名技能'
  }

  private createUniqueSlug(name: string) {
    const base = this.slugify(name) || `skill-${createHash('sha1').update(name).digest('hex').slice(0, 8)}`
    let slug = base
    let index = 2

    while (getSkillBySlug(this.db, slug)) {
      slug = `${base}-${index}`
      index += 1
    }

    return slug
  }

  private slugify(value: string) {
    const ascii = value
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .toLowerCase()
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')

    return ascii || `skill-${createHash('sha1').update(value).digest('hex').slice(0, 8)}`
  }

  private normalizeArchivePath(path: string) {
    const normalized = normalize(path.replace(/\\/g, '/')).replace(/\\/g, '/')

    if (
      !normalized
      || normalized.startsWith('../')
      || normalized.includes('/../')
      || isAbsolute(normalized)
      || /^[a-zA-Z]:/.test(normalized)
    ) {
      throw new Error('Skill ZIP contains an unsafe file path')
    }

    return normalized.replace(/^\.\//, '')
  }

  private resolveInside(baseDir: string, filePath: string) {
    const target = join(baseDir, filePath)
    const relativePath = relative(baseDir, target)

    if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
      throw new Error('Skill file path is outside the package directory')
    }

    return target
  }

  private removePackageDir(packageDir: string) {
    const relativePath = relative(this.rootDir, packageDir)

    if (!relativePath || relativePath.startsWith('..') || isAbsolute(relativePath)) {
      throw new Error('Skill package directory is invalid')
    }

    rmSync(packageDir, { recursive: true, force: true })
  }

  private truncate(content: string, maxLength: number) {
    return content.length > maxLength
      ? `${content.slice(0, maxLength)}\n\n[内容已截断]`
      : content
  }
}
