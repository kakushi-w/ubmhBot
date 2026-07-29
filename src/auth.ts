import { loadConfig, siteUrl } from "./config.js";
import { log } from "./log.js";
import { randomToken } from "./util.js";
import type { Session } from "./types.js";

const loginUrl = "https://www.wikidot.com/default--flow/login__LoginPopupScreen";
const testUrl = "https://www.wikidot.com/account/activity";
const originSiteId = "648902";

function collectCookies(res: Response, jar: Map<string, string>): void {
  for (const raw of res.headers.getSetCookie()) {
    const pair = raw.split(";")[0] ?? "";
    const index = pair.indexOf("=");
    if (index <= 0) continue;
    const name = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (!value || value === "deleted") jar.delete(name);
    else jar.set(name, value);
  }
}

function serializeCookies(jar: Map<string, string>): string {
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

export async function login(): Promise<Session> {
  const config = loadConfig();
  const username = process.env.WIKIDOT_USERNAME;
  const password = process.env.WIKIDOT_PASSWORD;
  if (!username || !password) {
    throw new Error("missing WIKIDOT_USERNAME or WIKIDOT_PASSWORD");
  }

  const jar = new Map<string, string>();
  const token7 = randomToken();
  jar.set("wikidot_token7", token7);

  const body = new URLSearchParams({
    login: username,
    password,
    originSiteId,
    action: "Login2Action",
    event: "login",
  });

  const loginRes = await fetch(loginUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": config.userAgent,
      Referer: "https://www.wikidot.com/",
      Cookie: serializeCookies(jar),
    },
    body: body.toString(),
    redirect: "manual",
  });
  collectCookies(loginRes, jar);
  jar.set("wikidot_token7", token7);

  const testRes = await fetch(testUrl, {
    headers: {
      "User-Agent": config.userAgent,
      Cookie: serializeCookies(jar),
    },
  });
  collectCookies(testRes, jar);
  jar.set("wikidot_token7", token7);

  const testText = await testRes.text();
  if (testText.includes("Sign in")) {
    throw new Error("login failed");
  }

  const siteRes = await fetch(`${siteUrl()}/`, {
    headers: {
      "User-Agent": config.userAgent,
      Cookie: serializeCookies(jar),
    },
  });
  collectCookies(siteRes, jar);
  jar.set("wikidot_token7", token7);

  log.info({ username }, "logged in");
  return { cookie: serializeCookies(jar), token7 };
}
