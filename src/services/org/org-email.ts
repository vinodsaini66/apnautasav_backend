import { EmailService } from '../email.service';

const escapeHtml = (v: string) =>
  v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const ROLE_LABEL: Record<string, string> = { owner: 'Owner', manager: 'Manager', coordinator: 'Coordinator' };

/** Staff invite to a planner organization. Never throws (EmailService.sendMail). */
export const sendOrgInviteEmail = (
  to: string,
  opts: { orgName: string; inviterName?: string; role: string; inviteLink: string }
) => {
  const who = opts.inviterName ? `${escapeHtml(opts.inviterName)} has` : 'You have been';
  const html = `
<div style="font-family:Georgia,'Times New Roman',serif;max-width:520px;margin:0 auto;padding:24px;color:#2b1620;">
  <h2 style="margin:0 0 12px;">Join ${escapeHtml(opts.orgName)} on ApnaUtsav</h2>
  <p style="font-size:15px;line-height:1.6;">${who} invited you to join <strong>${escapeHtml(opts.orgName)}</strong> as ${ROLE_LABEL[opts.role] ?? opts.role}.</p>
  <p style="font-size:15px;line-height:1.6;">Sign in with <strong>${escapeHtml(to)}</strong> to accept. The link works for 14 days.</p>
  <p style="margin:24px 0;"><a href="${opts.inviteLink}" style="background:#9e2b46;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;">Accept invite</a></p>
</div>`;
  return EmailService.sendMail(to, `Join ${opts.orgName} on ApnaUtsav`, html);
};
