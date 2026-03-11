export type EmailTemplate = never

export const emailSubjects: Record<EmailTemplate, string> = {} as Record<EmailTemplate, string>

export async function renderEmailTemplate(
  template: EmailTemplate,
  // biome-ignore lint/suspicious/noExplicitAny: Email template data can have various shapes
  _data: Record<string, any>
): Promise<string> {
  throw new Error(`Unknown email template: ${template}`)
}
