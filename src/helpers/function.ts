import { env } from "../config/env";
import { Response } from "express";

export async function sendInvitationSms(phoneNumber: string, invitationCode: string) {
    console.log(`📩 SMS sent to ${phoneNumber}: Your invite code is ${invitationCode}`);
    return true;
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