import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

function setCors(res) {
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
}

function normalizeUrl(input) {
  const trimmed = String(input || "").trim();
  if (!trimmed) {
    throw new Error("URL을 입력해주세요.");
  }

  const withProtocol = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  const url = new URL(withProtocol);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("http 또는 https 주소만 분석할 수 있습니다.");
  }

  return url.toString();
}

export const config = {
  runtime: "nodejs20.x"
};

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    setCors(res);
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    setCors(res);
    return res.status(405).json({ success: false, error: "POST 요청만 허용됩니다." });
  }

  let browser;

  try {
    const normalizedUrl = normalizeUrl(req.body?.url);

    const executablePath = await chromium.executablePath();

    browser = await puppeteer.launch({
      args: [...chromium.args, "--hide-scrollbars", "--disable-web-security"],
      defaultViewport: {
        width: 1440,
        height: 2200
      },
      executablePath,
      headless: chromium.headless
    });

    const page = await browser.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    );

    await page.goto(normalizedUrl, {
      waitUntil: "domcontentloaded",
      timeout: 15000
    });

    await new Promise((resolve) => setTimeout(resolve, 1200));

    const html = await page.content();
    const title = await page.title();
    const screenshot = await page.screenshot({
      encoding: "base64",
      fullPage: true,
      type: "jpeg",
      quality: 60
    });

    const finalUrl = page.url();

    setCors(res);
    res.setHeader("Content-Type", "application/json");

    return res.status(200).json({
      success: true,
      sourceUrl: normalizedUrl,
      resolvedUrl: finalUrl,
      title: title || normalizedUrl,
      html,
      screenshot: `data:image/jpeg;base64,${screenshot}`,
      timestamp: new Date().toISOString(),
      size: {
        html: `${(html.length / 1024).toFixed(2)} KB`,
        screenshot: `${(screenshot.length / 1024).toFixed(2)} KB`
      }
    });
  } catch (error) {
    console.error("crawl api error:", error);
    setCors(res);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // ignore
      }
    }
  }
}
