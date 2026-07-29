import { loadConfig, siteUrl } from "./config.js";
import { log } from "./log.js";
import { sleep } from "./util.js";
import type { AmcResponse, Session } from "./types.js";

const maxRetries = 6;
const baseDelay = 500;

export async function callAmc(
  session: Session,
  params: Record<string, string | number>
): Promise<AmcResponse | null> {
  const config = loadConfig();
  const url = `${siteUrl()}/ajax-module-connector.php`;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const body = new URLSearchParams({
        wikidot_token7: session.token7,
        ...Object.fromEntries(
          Object.entries(params).map(([key, value]) => [key, String(value)])
        ),
      });

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": config.userAgent,
          Referer: `${siteUrl()}/`,
          Cookie: session.cookie,
        },
        body: body.toString(),
      });

      if (res.status === 429 || res.status >= 500) {
        await sleep(baseDelay * Math.pow(2, attempt));
        continue;
      }

      const json = (await res.json()) as AmcResponse;
      if (json.status === "try_again") {
        await sleep(baseDelay * Math.pow(2, attempt));
        continue;
      }
      return json;
    } catch (err) {
      log.warn({ err, attempt, params }, "amc request error");
      if (attempt === maxRetries - 1) return null;
      await sleep(baseDelay * Math.pow(2, attempt));
    }
  }

  log.warn({ params }, "amc gave up");
  return null;
}

export async function fetchText(session: Session, url: string): Promise<string | null> {
  const config = loadConfig();

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": config.userAgent,
          Referer: `${siteUrl()}/`,
          Cookie: session.cookie,
        },
      });

      if (res.status === 429 || res.status >= 500) {
        await sleep(baseDelay * Math.pow(2, attempt));
        continue;
      }
      if (!res.ok) return null;
      return await res.text();
    } catch (err) {
      log.warn({ err, attempt, url }, "fetch error");
      if (attempt === maxRetries - 1) return null;
      await sleep(baseDelay * Math.pow(2, attempt));
    }
  }

  return null;
}
