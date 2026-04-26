export type SkillSourceType = 'md' | 'zip' | 'manual' | 'agent_authored'

export interface SkillEditorInput {
  name: string
  description: string
  content: string
  enabled: boolean
  requiredTools: string[]
}

export interface SkillImportInput {
  fileName: string
  contentBase64: string
  sourceType?: SkillSourceType
}

export interface SkillReferenceInfo {
  path: string
  title: string
  size: number
}

export interface LoadedSkillReference extends SkillReferenceInfo {
  content: string
}

export interface SkillProfile {
  id: string
  name: string
  slug: string
  description: string
  version: string
  sourceType: SkillSourceType
  ownerBotInstanceId: string | null
  entryFile: string
  enabled: boolean
  requiredTools: string[]
  referenceCount: number
  createdAt: string
  updatedAt: string
}

export interface SkillContent {
  content: string
  references: SkillReferenceInfo[]
}

export interface AvailableSkill {
  id: string
  name: string
  description: string
  requiredTools: string[]
  referenceCount: number
}

export interface LoadedSkill {
  id: string
  name: string
  description: string
  requiredTools: string[]
  content: string
  references: LoadedSkillReference[]
}
