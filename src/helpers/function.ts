import { env } from "../config/env";
import { Response } from "express";
import { SMSService } from "../services/sms.service";
import { EmailService } from "../services/email.service";

export async function sendInvitationSms(phoneNumber: string, invitationCode: string) {
    const message = `You've been invited to collaborate on a wedding on ApnaUtsav! Your invite code is ${invitationCode}.`;
    return SMSService.sendSMS(phoneNumber, message);
}

const escapeHtml = (v: string) =>
    v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

/**
 * Wedding-collaboration invite for someone who doesn't have an account yet.
 * Their CollaborationInvitation turns into a pending Collaborator the first
 * time they log in with this email (AuthService.verifyOTP), so the email just
 * has to get them to sign in. Never throws (EmailService.sendMail).
 */
export async function sendCollaborationInviteEmail(
    to: string,
    opts: { inviterName?: string; weddingName?: string }
) {
    const loginUrl = `${(process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/+$/, "")}/auth/login`;
    const who = escapeHtml(opts.inviterName || "Someone");
    const what = opts.weddingName ? `<strong>${escapeHtml(opts.weddingName)}</strong>` : "their wedding";
    const html = `
<div style="font-family:Georgia,'Times New Roman',serif;max-width:520px;margin:0 auto;padding:24px;color:#2b1620;">
  <h2 style="margin:0 0 12px;">You're invited on ApnaUtsav</h2>
  <p style="font-size:15px;line-height:1.6;">${who} has invited you to help plan ${what}.</p>
  <p style="font-size:15px;line-height:1.6;">Sign in with <strong>${escapeHtml(to)}</strong> and the invitation will be waiting on your dashboard.</p>
  <p style="margin:24px 0;"><a href="${loginUrl}" style="background:#9e2b46;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;">Open ApnaUtsav</a></p>
</div>`;
    const subject = opts.inviterName
        ? `${opts.inviterName} invited you to plan a wedding on ApnaUtsav`
        : "You're invited to plan a wedding on ApnaUtsav";
    return EmailService.sendMail(to, subject, html);
}

export function setAuthCookie(res: Response, token: string) {
    const isProd = env.NODE_ENV === "production";
    res.cookie("token", token, {
        httpOnly: true,
        secure: isProd,
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000
    });
    
}

export function clearAuthCookie(res: Response) {
    res.clearCookie("token", {
        httpOnly: true,
        sameSite: "strict"
    });
}