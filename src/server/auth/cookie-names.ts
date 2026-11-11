/**
 * Cookie names, kept free of imports so the proxy can use them without pulling
 * in the data layer. `__Host-` cookies require HTTPS, so they're production-only.
 */
const secure = process.env.NODE_ENV === "production";

export const SESSION_COOKIE = secure ? "__Host-acm_session" : "acm_session";
export const OAUTH_COOKIE = secure ? "__Host-acm_oauth" : "acm_oauth";
