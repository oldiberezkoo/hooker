import crypto from "crypto";
import { debug, errorLog } from "./logger";

export function fileHash(content: string): string {
  try {
    const hash = crypto
      .createHash("sha256")
      .update(content)
      .digest("hex")
      .slice(0, 32);
    debug(`[fileHash] Calculated hash: ${hash}`);
    return hash;
  } catch (err) {
    errorLog("[fileHash] Failed to calculate hash", err);
    return "unknown_hash";
  }
}
