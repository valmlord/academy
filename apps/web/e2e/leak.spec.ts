import { expect, type Page, type Response, type Route, test } from "@playwright/test";
import { breadcrumbLabel, courseLinkLabel, notFoundTitle, taskTabLabel } from "../lib/copy";
import { catalogPath, lessonPath } from "../lib/routes";
import { repoCatalog, repoDashboard } from "./course";
import { useOwnBucket } from "./fixtures";
import { FragmentScanner, forbiddenFragments, sha256 } from "./leak-fragments";

// Every page load reads /api/auth/get-session; with its own rate-limit bucket per test the suite never
// exhausts the shared loopback bucket that the request-fixture specs use (Better Auth limiter, always on).
test.beforeEach(async ({ page }) => {
  await useOwnBucket(page);
});

// Layer 2 of the leak defence (design 7.2): every same-origin text body a signed-in learner receives on
// each page kind is scanned for grader fragments. Prefetch is never relied on: every lesson is visited.

const TEST_TIMEOUT_MS = 60_000;
const MIN_FRAGMENTS = 1_000;
const TEXT_TYPE = /text\/html|javascript|json|text\/plain|text\/x-component/;

type BodyRead = { isRead: true; text: string } | { isRead: false; reason: string };

interface PendingBody {
  url: string;
  isPrefetch: boolean;
  capturedAt: number;
  /** Never rejects: a read started at once and failing before the settle must not end the test early. */
  body: Promise<BodyRead>;
}

// Chromium keeps no body for a streamed fetch the page has consumed, so an RSC response (request header
// `rsc: 1`, a router navigation or prefetch) is read through a route: fetched by the test, recorded, and
// fulfilled with the same response. Every other text response is read from the response event.
class BodyCapture {
  readonly bodies = new Map<string, { url: string; body: string }>();
  /** RSC bodies read through the route, prefetches included. */
  rscResponses = 0;
  private pending: PendingBody[] = [];
  private idleAt = 0;

  private constructor(private readonly origin: string) {}

  static async start(page: Page, origin: string): Promise<BodyCapture> {
    const capture = new BodyCapture(origin);
    await page.route(
      (url) => url.origin === origin,
      (route) => capture.onRoute(route),
    );
    page.on("response", (response) => capture.onResponse(response));
    return capture;
  }

  private async onRoute(route: Route): Promise<void> {
    const request = route.request();
    if (request.headers().rsc !== "1") {
      await route.fallback();
      return;
    }
    let settle: (read: BodyRead) => void = () => undefined;
    this.pending.push({
      url: request.url(),
      isPrefetch: request.headers()["next-router-prefetch"] === "1",
      capturedAt: Date.now(),
      body: new Promise<BodyRead>((resolve) => {
        settle = resolve;
      }),
    });
    try {
      const response = await route.fetch();
      const text = await response.text();
      this.rscResponses += 1;
      settle({ isRead: true, text });
      await route.fulfill({ response, body: text });
    } catch (error) {
      // The page went away mid-request (a late prefetch at the end of a test): reported by settle().
      settle({ isRead: false, reason: String(error) });
    }
  }

  private onResponse(response: Response): void {
    if (new URL(response.url()).origin !== this.origin) return;
    if (response.request().headers().rsc === "1") return;
    const status = response.status();
    if (status >= 300 && status < 400) return;
    const contentType = response.headers()["content-type"] ?? "";
    if (!TEXT_TYPE.test(contentType)) return;
    this.pending.push({
      url: response.url(),
      isPrefetch: response.request().headers()["next-router-prefetch"] === "1",
      capturedAt: Date.now(),
      body: response.text().then(
        (text): BodyRead => ({ isRead: true, text }),
        (error: unknown): BodyRead => ({ isRead: false, reason: String(error) }),
      ),
    });
  }

  /**
   * Waits for the network to go quiet, then reads every body captured since the last settle. A body that
   * cannot be read fails the test, except a prefetch fired after the previous settle and evicted by the
   * navigation that followed (design 7.2, O N2).
   */
  async settle(page: Page): Promise<void> {
    await page.waitForLoadState("networkidle");
    const previousIdleAt = this.idleAt;
    this.idleAt = Date.now();
    const batch = this.pending.splice(0);
    for (const entry of batch) {
      const read = await entry.body;
      if (read.isRead) {
        this.bodies.set(sha256(read.text), { url: entry.url, body: read.text });
      } else if (entry.isPrefetch && entry.capturedAt >= previousIdleAt) {
        console.log(`ignored late prefetch ${entry.url}`);
      } else {
        throw new Error(`could not read the body of ${entry.url}: ${read.reason.split("\n")[0]}`);
      }
    }
  }
}

let scanner: FragmentScanner;
let theoryFragments: Map<string, string[]>;

test.beforeAll(async () => {
  const forbidden = await forbiddenFragments();
  console.log(`forbidden fragments: ${forbidden.fragments.length}`);
  expect(forbidden.fragments.length, "forbidden fragments").toBeGreaterThanOrEqual(MIN_FRAGMENTS);
  scanner = new FragmentScanner(forbidden.fragments);
  theoryFragments = forbidden.theoryFragments;
});

function expectNoLeak(capture: BodyCapture): void {
  const startedAt = Date.now();
  let bytes = 0;
  const leaks: string[] = [];
  for (const { url, body } of capture.bodies.values()) {
    bytes += body.length;
    for (const fragment of scanner.scan(body)) leaks.push(`${url}: ${fragment}`);
  }
  console.log(
    `scanned ${bytes} characters in ${capture.bodies.size} distinct bodies, ${Date.now() - startedAt} ms`,
  );
  expect(leaks, "grader fragments in served bodies").toEqual([]);
}

function startCapture(page: Page, baseURL: string | undefined): Promise<BodyCapture> {
  if (baseURL === undefined) throw new Error("baseURL is not configured in playwright.config.ts");
  return BodyCapture.start(page, new URL(baseURL).origin);
}

test("the catalog serves no grader fragment", async ({ page, baseURL }) => {
  test.setTimeout(TEST_TIMEOUT_MS);
  const catalog = await repoCatalog();
  const capture = await startCapture(page, baseURL);

  await page.goto(catalogPath(catalog.id));
  await expect(page.getByRole("heading", { level: 1, name: catalog.title })).toBeVisible();
  await capture.settle(page);

  expectNoLeak(capture);
});

const catalogForTests = await repoCatalog();
const visibleLessons = catalogForTests.modules.flatMap((module) => module.lessons);

for (const lesson of visibleLessons) {
  test(`lesson ${lesson.id} serves no grader fragment on either tab`, async ({ page, baseURL }) => {
    test.setTimeout(TEST_TIMEOUT_MS);
    const capture = await startCapture(page, baseURL);

    await page.goto(`${lessonPath(catalogForTests.id, lesson.id)}?tab=theory`);
    await expect(page.getByRole("heading", { level: 1, name: lesson.title })).toBeVisible();
    await capture.settle(page);
    await page.getByRole("tab", { name: taskTabLabel }).click();
    await expect(page.getByRole("tab", { name: taskTabLabel })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await capture.settle(page);

    const controls = theoryFragments.get(lesson.id) ?? [];
    const bodies = [...capture.bodies.values()].map((entry) => entry.body);
    expect(
      controls.some((fragment) => bodies.some((body) => body.includes(fragment))),
      "positive control: a fragment of theory.md is in a captured body",
    ).toBe(true);
    expectNoLeak(capture);
  });
}

test("a client navigation's RSC payloads serve no grader fragment", async ({ page, baseURL }) => {
  test.setTimeout(TEST_TIMEOUT_MS);
  const [first] = visibleLessons;
  if (first === undefined) throw new Error("the course needs a visible lesson");
  const capture = await startCapture(page, baseURL);

  await page.goto(catalogPath(catalogForTests.id));
  await capture.settle(page);
  await page
    .locator(`main a[href="${lessonPath(catalogForTests.id, first.id)}"]`)
    .first()
    .click();
  await expect(page.getByRole("heading", { level: 1, name: first.title })).toBeVisible();
  await capture.settle(page);
  await page
    .getByRole("navigation", { name: breadcrumbLabel })
    .getByRole("link", { name: courseLinkLabel })
    .click();
  await expect(page.getByRole("heading", { level: 1, name: catalogForTests.title })).toBeVisible();
  await capture.settle(page);

  console.log(`RSC bodies read: ${capture.rscResponses}`);
  expect(capture.rscResponses, "RSC bodies read").toBeGreaterThan(0);
  expectNoLeak(capture);
});

test("the not-found page serves no grader fragment", async ({ page, baseURL }) => {
  test.setTimeout(TEST_TIMEOUT_MS);
  const capture = await startCapture(page, baseURL);

  const response = await page.goto(`${lessonPath(catalogForTests.id, "no-such-lesson")}`);
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: notFoundTitle })).toBeVisible();
  await capture.settle(page);

  expectNoLeak(capture);
});

test("the dashboard serves no grader fragment", async ({ page, baseURL }) => {
  test.setTimeout(TEST_TIMEOUT_MS);
  const { next } = await repoDashboard();
  if (next === null) throw new Error("the course needs a visible lesson");
  const capture = await startCapture(page, baseURL);

  const response = await page.goto("/");
  const html = (await response?.text()) ?? "";
  await capture.settle(page);

  expect(html.includes(next.title), "positive control: the next lesson's title in the HTML").toBe(
    true,
  );
  expectNoLeak(capture);
});
