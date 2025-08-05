export function debug(context: string, ...args: any[]): void {
  // Central debug logger, can be enhanced to log to file or external system
  // eslint-disable-next-line no-console
  console.log(`[DEBUG] ${context}`, ...args);
}

export function errorLog(context: string, ...args: any[]): void {
  // Central error logger, can be enhanced to log to file or external system
  // eslint-disable-next-line no-console
  console.error(`[ERROR] ${context}`, ...args);
}
