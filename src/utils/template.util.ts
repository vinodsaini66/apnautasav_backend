// Minimal {{placeholder}} substitution for guest-facing message composition
// (#2 + #7, guest.controller.ts's composeAndSend) — deliberately a plain
// string .replace(), no templating engine. An unrecognized placeholder is
// left in the output untouched rather than silently stripped, so a typo in
// the composed message stays visible to whoever sent it.
export const renderTemplate = (template: string, vars: Record<string, string>): string => {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => {
    return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match;
  });
};
