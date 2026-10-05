export const replaceVariables = (template: string, variables: Record<string, string>) => {
  return template.replace(/\$\{([\w.]+)\}/g, (_, key) => variables[key] ?? `\${${key}}`)
}
