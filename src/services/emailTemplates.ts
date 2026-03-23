export type EmailTemplateName =
  | "userInvited"
  | "apiKeyRotated"
  | "rateLimitThresholdWarning";

export const emailTemplates = {
  userInvited: (data: { tenantName: string; inviteeName: string }) => ({
    subject: `Welcome to ${data.tenantName}`,
    body: `Hi ${data.inviteeName},\n\nYou were invited to ${data.tenantName}.`
  }),
  apiKeyRotated: (data: { ownerName: string }) => ({
    subject: "API key rotated",
    body: `Hi ${data.ownerName},\n\nYour API key has been rotated successfully.`
  }),
  rateLimitThresholdWarning: (data: { tenantName: string; usage: number; limit: number }) => ({
    subject: `Rate limit warning for ${data.tenantName}`,
    body: `Usage reached ${data.usage}/${data.limit} requests in the current minute.`
  })
};
