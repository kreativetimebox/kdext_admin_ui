const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  await page.goto("http://127.0.0.1:3000", {
    waitUntil: "networkidle",
    timeout: 30000,
  });

  const result = await page.evaluate(() => {
    const bodyStyles = getComputedStyle(document.body);
    const h1 = document.querySelector("h1");
    const nav = document.querySelector("header");
    return {
      title: document.title,
      h1: h1 ? h1.textContent.trim() : null,
      hasGradientBackground: bodyStyles.backgroundImage.includes("gradient"),
      hasHeader: Boolean(nav),
      bodyTextLength: document.body.innerText.length,
    };
  });

  await page.screenshot({ path: "tmp/home-smoke.png", fullPage: false });
  await browser.close();
  console.log(JSON.stringify(result, null, 2));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
