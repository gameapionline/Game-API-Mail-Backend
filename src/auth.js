import { supabaseAdmin } from "./supabase.js";

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const match = header.match(/^Bearer\s+(.+)$/i);

    if (!match) {
      return res.status(401).json({ error: "Authentication required.", code: "AUTH_REQUIRED" });
    }

    const { data, error } = await supabaseAdmin.auth.getUser(match[1]);

    if (error || !data?.user) {
      return res.status(401).json({ error: "Invalid or expired session.", code: "AUTH_INVALID" });
    }

    req.user = data.user;
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    res.status(401).json({ error: "Authentication failed.", code: "AUTH_FAILED" });
  }
}
