import {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js'
import type { ButtonInteraction, ChatInputCommandInteraction, ModalSubmitInteraction } from 'discord.js'
import type { ToolApprovalDecision } from '@zakobot/shared'

export type PendingApproval = {
  finish: (decision: ToolApprovalDecision) => Promise<void>
  remember: () => Promise<void>
  guide: (interaction: ModalSubmitInteraction, guidance: string) => Promise<void>
  askAI: (interaction: ModalSubmitInteraction, question: string) => Promise<void>
}

export type RepliableInteraction = ButtonInteraction | ModalSubmitInteraction | ChatInputCommandInteraction

export async function handleApprovalInteraction(
  interaction: ButtonInteraction | ModalSubmitInteraction,
  pendingApprovals: Map<string, PendingApproval>,
): Promise<boolean> {
  if (interaction.isButton()) {
    const { action, value: callId } = parseInteractionAction(interaction.customId)
    const approval = callId ? pendingApprovals.get(callId) : undefined

    if (!callId || !action.startsWith('tool_')) {
      return false
    }

    if (!approval) {
      await replyEphemeral(interaction, '此操作已过期。')
      return true
    }

    if (action === 'tool_approve') {
      await interaction.deferUpdate().catch(() => {})
      await approval.finish({ approved: true })
      return true
    }

    if (action === 'tool_always') {
      await interaction.deferUpdate().catch(() => {})
      await approval.remember()
      return true
    }

    if (action === 'tool_deny') {
      await interaction.deferUpdate().catch(() => {})
      await approval.finish({ approved: false })
      return true
    }

    if (action === 'tool_guide') {
      await interaction.showModal(buildApprovalQuestionModal(
        `tool_guide_modal:${callId}`,
        '指导模型',
        '指导内容',
        '例如：先 ls 确认目录，再仅删除临时文件，不要直接 rm -rf。',
        true,
      )).catch(() => {})
      return true
    }

    if (action === 'tool_ask_ai') {
      await interaction.showModal(buildApprovalQuestionModal(
        `tool_ask_ai_modal:${callId}`,
        '临时问 AI',
        '你想问什么？',
        '例如：为什么现在需要执行这一步？如果拒绝会卡在哪里？',
        false,
      )).catch(() => {})
      return true
    }

    return false
  }

  const { action, value: callId } = parseInteractionAction(interaction.customId)
  const approval = callId ? pendingApprovals.get(callId) : undefined

  if (!callId || !action.startsWith('tool_')) {
    return false
  }

  if (!approval) {
    await replyEphemeral(interaction, '此操作已过期。')
    return true
  }

  const question = interaction.fields.getTextInputValue('question').trim()

  if (action === 'tool_guide_modal') {
    await approval.guide(interaction, question)
    return true
  }

  if (action === 'tool_ask_ai_modal') {
    await approval.askAI(interaction, question)
    return true
  }

  return false
}

export async function replyEphemeral(interaction: RepliableInteraction, content: string): Promise<void> {
  if (interaction.replied || interaction.deferred) {
    await interaction.followUp({ content, flags: MessageFlags.Ephemeral }).catch(() => {})
    return
  }

  await interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => {})
}

function parseInteractionAction(customId: string): { action: string, value: string } {
  const separatorIndex = customId.indexOf(':')
  if (separatorIndex === -1) {
    return { action: customId, value: '' }
  }

  return {
    action: customId.slice(0, separatorIndex),
    value: customId.slice(separatorIndex + 1),
  }
}

function buildApprovalQuestionModal(
  customId: string,
  title: string,
  label: string,
  placeholder: string,
  required: boolean,
): ModalBuilder {
  const input = new TextInputBuilder()
    .setCustomId('question')
    .setLabel(label)
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(required)
    .setMaxLength(500)
    .setPlaceholder(placeholder)

  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(title)
    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input))
}
