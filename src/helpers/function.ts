import { env } from "../config/env";
import { Response } from "express";
import { SMSService } from "../services/sms.service";

export async function sendInvitationSms(phoneNumber: string, invitationCode: string) {
    const message = `You've been invited to collaborate on a wedding on ApnaUtsav! Your invite code is ${invitationCode}.`;
    return SMSService.sendSMS(phoneNumber, message);
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