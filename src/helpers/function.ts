async function sendInvitationSms(phoneNumber: string, invitationCode: string) {
    console.log(`📩 SMS sent to ${phoneNumber}: Your invite code is ${invitationCode}`);
    return true;
}