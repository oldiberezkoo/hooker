export function debug(...args: any[]): void {
  // Central debug logger, can be enhanced to log to file or external system
  // eslint-disable-next-line no-console
  console.log("[DEBUG]", ...args);
}

export function errorLog(...args: any[]): void {
  // Central error logger, can be enhanced to log to file or external system
  // eslint-disable-next-line no-console
  console.error("[ERROR]", ...args);
}
