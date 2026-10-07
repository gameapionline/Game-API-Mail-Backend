import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import { config } from "../config.js";

export function createSmtpTransport(credentials) {
  return nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: { user: credentials.email, pass: credentials.password },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000
  });
}

export function createImapClient(credentials) {
  return new ImapFlow({
    host: config.imap.host,
    port: config.imap.port,
    secure: config.imap.secure,
    auth: { user: credentials.email, pass: credentials.password },
    logger: false
  });
}
