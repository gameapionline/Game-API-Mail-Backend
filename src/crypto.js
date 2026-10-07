import crypto from "node:crypto";
import { config } from "./config.js";

function getKey() {
  if (!config.encryptionKey) throw new Error("APP_ENCRYPTION_KEY is required.");
  const key = Buffer.from(config.encryptionKey, "base64");
  if (key.length !== 32) throw new Error("APP_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  return key;
}

export function encryptSecret(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64")
  };
}

export function decryptSecret(record) {
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), Buffer.from(record.iv, "base64"));
  decipher.setAuthTag(Buffer.from(record.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(record.ciphertext, "base64")),
    decipher.final()
  ]).toString("utf8");
}

export function generateMailboxPassword() {
  return crypto.randomBytes(24).toString("base64url") + "Aa1!";
}

export function generateEncryptionKey() {
  return crypto.randomBytes(32).toString("base64");
}
