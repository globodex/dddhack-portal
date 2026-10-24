// Executes actual bundled React effects with deterministic browser primitives.
// This is mocked lifecycle evidence, separate from actual Playwright screenshots.
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const sourceRoot = resolve(
  process.env.MIGRATION_UI_SOURCE_ROOT || process.cwd(),
);
const output = mkdtempSync(join(tmpdir(), "migration-motion-"));
async function checkDots() {
  await build({
    entryPoints: [join(sourceRoot, "app/dots.tsx")],
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile: join(output, "dots.cjs"),
    jsx: "transform",
    jsxFactory: "h",
    tsconfigRaw: { compilerOptions: { jsx: "react" } },
    banner: {
      js: "const h=(type,props,...children)=>({type,props,children});",
    },
    plugins: [
      {
        name: "mock-hooks",
        setup(b) {
          b.onResolve({ filter: /^react$/ }, () => ({
            path: "react",
            namespace: "mock",
          }));
          b.onLoad({ filter: /.*/, namespace: "mock" }, () => ({
            contents:
              "export const useRef = (...args) => globalThis.__uiHooks.useRef(...args); export const useEffect = (...args) => globalThis.__uiHooks.useEffect(...args);",
            loader: "js",
          }));
        },
      },
    ],
  });
  const Dots = createRequire(import.meta.url)(join(output, "dots.cjs")).default;
  function harness() {
    const nodes = Array.from({ length: 8 }, () => ({
      style: {},
      mark: { style: {} },
      querySelector(s) {
        return s === "text" ? this.mark : { setAttribute() {} };
      },
    }));
    const rect = { left: 40, top: 80, width: 480, height: 440 };
    const stage = {
      dataset: {},
      querySelectorAll: () => nodes,
      getBoundingClientRect: () => ({ ...rect }),
    };
    const window = new EventTarget(),
      document = new EventTarget(),
      media = new EventTarget();
    document.hidden = false;
    media.matches = false;
    let resize,
      intersect,
      cleanup,
      cursor = 0,
      refs = [],
      nextFrame = 1,
      clock = 1000;
    const frames = new Map();
    globalThis.window = window;
    globalThis.document = document;
    globalThis.matchMedia = () => media;
    globalThis.innerWidth = 1440;
    globalThis.ResizeObserver = class {
      constructor(cb) {
        resize = cb;
      }
      observe() {}
      disconnect() {}
    };
    globalThis.IntersectionObserver = class {
      constructor(cb) {
        intersect = cb;
      }
      observe() {}
      disconnect() {}
    };
    globalThis.requestAnimationFrame = (cb) => {
      const id = nextFrame++;
      frames.set(id, cb);
      return id;
    };
    globalThis.cancelAnimationFrame = (id) => frames.delete(id);
    globalThis.__uiHooks = {
      useRef(initial) {
        const i = cursor++;
        return (refs[i] ??= { current: i === 0 ? stage : initial });
      },
      useEffect(cb) {
        cleanup = cb();
      },
    };
    const render = (paused = false) => {
      cleanup?.();
      cursor = 0;
      Dots({ paused });
    };
    const tick = (delta = 16.67) => {
      clock += delta;
      const next = [...frames.values()];
      frames.clear();
      next.forEach((cb) => cb(clock));
    };
    const settle = () => {
      for (let i = 0; i < 500 && frames.size; i++) tick();
    };
    const event = (target, name, props = {}) => {
      const e = new Event(name);
      Object.assign(e, props);
      target.dispatchEvent(e);
    };
    const visible = (value) => intersect([{ isIntersecting: value }]);
    const y = () =>
      nodes.map((n) => Number(n.style.transform.match(/,([^,]+)px,/)[1]));
    return {
      nodes,
      rect,
      stage,
      frames,
      window,
      document,
      media,
      render,
      tick,
      settle,
      event,
      visible,
      y,
      resize: () => resize(),
      close: () => cleanup?.(),
    };
  }
  let checks = 0;
  {
    const h = harness();
    h.render();
    assert.equal(h.frames.size, 0);
    h.visible(true);
    h.tick();
    assert.ok(h.y().some((y) => y < 0));
    h.settle();
    const home = h.nodes.map((n) => n.style.transform);
    assert.equal(h.stage.dataset.running, "false");
    checks++;
    h.rect.width = 400;
    h.resize();
    assert.ok(h.y().every((y) => y >= 0));
    h.settle();
    const resized = h.nodes.map((n) => n.style.transform);
    assert.notDeepEqual(home, resized);
    checks++;
    h.render(true);
    h.visible(true);
    assert.equal(h.frames.size, 0);
    assert.ok(h.y().every((y) => y >= 0));
    h.render(false);
    h.visible(true);
    assert.ok(h.y().every((y) => y >= 0));
    h.settle();
    assert.deepEqual(
      h.nodes.map((n) => n.style.transform),
      resized,
    );
    checks++;
    h.event(h.window, "pointermove", {
      pointerType: "mouse",
      clientX: 230,
      clientY: 270,
    });
    h.settle();
    assert.notDeepEqual(
      h.nodes.map((n) => n.style.transform),
      resized,
    );
    h.event(h.window, "pointerout", { relatedTarget: null });
    h.settle();
    for (let i = 0; i < 8; i++)
      assert.ok(
        Math.abs(h.y()[i] - Number(resized[i].match(/,([^,]+)px,/)[1])) < 0.1,
      );
    checks++;
    h.event(h.window, "pointermove", {
      pointerType: "mouse",
      clientX: 230,
      clientY: 270,
    });
    h.settle();
    h.event(h.window, "scroll");
    h.settle();
    for (let i = 0; i < 8; i++)
      assert.ok(
        Math.abs(h.y()[i] - Number(resized[i].match(/,([^,]+)px,/)[1])) < 0.1,
      );
    checks++;
    h.rect.top = 200;
    h.event(h.window, "pointermove", {
      pointerType: "mouse",
      clientX: 230,
      clientY: 220,
    });
    h.settle();
    assert.ok(
      h.nodes.some((n) => !n.mark.style.transform.startsWith("translate(0px")),
    );
    h.visible(false);
    assert.equal(h.frames.size, 0);
    h.event(h.window, "pointermove", {
      pointerType: "mouse",
      clientX: 230,
      clientY: 220,
    });
    assert.equal(h.frames.size, 0);
    checks++;
    h.close();
  }
  {
    const h = harness();
    h.render();
    h.visible(true);
    h.tick();
    h.tick();
    h.tick();
    const before = h.nodes.map((n) => n.style.transform);
    h.document.hidden = true;
    h.event(h.document, "visibilitychange");
    assert.equal(h.frames.size, 0);
    assert.equal(h.stage.dataset.visible, "false");
    h.tick(5000);
    assert.deepEqual(
      h.nodes.map((n) => n.style.transform),
      before,
    );
    h.document.hidden = false;
    h.event(h.document, "visibilitychange");
    h.tick(5000);
    assert.deepEqual(
      h.nodes.map((n) => n.style.transform),
      before,
    );
    h.tick();
    assert.notDeepEqual(
      h.nodes.map((n) => n.style.transform),
      before,
    );
    checks++;
    h.close();
  }
  {
    const h = harness();
    h.render();
    h.visible(true);
    h.tick();
    h.tick();
    const before = h.nodes.map((n) => n.style.transform);
    h.visible(false);
    h.tick(5000);
    h.visible(true);
    h.tick(5000);
    assert.deepEqual(
      h.nodes.map((n) => n.style.transform),
      before,
    );
    checks++;
    h.close();
  }
  {
    const h = harness();
    h.media.matches = true;
    h.render();
    h.visible(true);
    assert.equal(h.frames.size, 0);
    assert.ok(h.y().every((y) => y >= 0));
    h.media.matches = false;
    h.event(h.media, "change");
    assert.ok(h.y().every((y) => y >= 0));
    h.settle();
    assert.ok(h.y().every((y) => y >= 0));
    checks++;
    h.close();
  }
  return { component: "Dots", checks, passed: true };
}

async function checkDelhi() {
  await build({
    entryPoints: [join(sourceRoot, "app/delhi-wordmark.tsx")],
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile: join(output, "delhi.cjs"),
    jsx: "transform",
    jsxFactory: "h",
    jsxFragment: "F",
    tsconfigRaw: { compilerOptions: { jsx: "react" } },
    banner: {
      js: 'const F="fragment"; const h=(type,props,...children)=>({type,props,children});',
    },
    plugins: [
      {
        name: "mock-hooks",
        setup(b) {
          b.onResolve({ filter: /^react$/ }, () => ({
            path: "react",
            namespace: "mock",
          }));
          b.onLoad({ filter: /.*/, namespace: "mock" }, () => ({
            contents:
              "export const useRef = (...args) => globalThis.__uiHooks.useRef(...args); export const useEffect = (...args) => globalThis.__uiHooks.useEffect(...args); export const useState = (...args) => globalThis.__uiHooks.useState(...args);",
            loader: "js",
          }));
        },
      },
    ],
  });
  const Delhi = createRequire(import.meta.url)(
    join(output, "delhi.cjs"),
  ).default;
  function harness(coarse = false) {
    const root = {
        getBoundingClientRect: () => ({
          left: 20,
          top: 30,
          width: 500,
          height: 115,
        }),
      },
      fill = { style: { transform: "" } },
      window = new EventTarget(),
      document = new EventTarget(),
      media = new EventTarget();
    document.hidden = false;
    media.matches = coarse;
    let intersect,
      resize,
      refIndex = 0,
      stateIndex = 0,
      effectIndex = 0,
      refs = [],
      states = [],
      effects = [],
      queued = [],
      requests = [];
    globalThis.window = window;
    globalThis.document = document;
    globalThis.matchMedia = () => media;
    globalThis.CSS = { supports: () => true };
    globalThis.ResizeObserver = class {
      constructor(cb) {
        resize = cb;
      }
      observe() {}
      disconnect() {}
    };
    globalThis.IntersectionObserver = class {
      constructor(cb) {
        intersect = cb;
      }
      observe() {}
      disconnect() {}
    };
    globalThis.fetch = async (src) => {
      requests.push(src);
      return new Response(new Blob(["mask"], { type: "image/webp" }));
    };
    globalThis.Image = class {
      set src(src) {
        requests.push(src);
        queueMicrotask(() => this.onload?.());
      }
      async decode() {}
    };
    globalThis.__uiHooks = {
      useRef(initial) {
        const i = refIndex++;
        return (refs[i] ??= {
          current: i === 0 ? root : i === 1 ? fill : initial,
        });
      },
      useState(initial) {
        const i = stateIndex++;
        if (!(i in states)) states[i] = initial;
        return [
          states[i],
          (next) =>
            (states[i] = typeof next === "function" ? next(states[i]) : next),
        ];
      },
      useEffect(cb, deps) {
        const i = effectIndex++,
          old = effects[i];
        if (!old || deps.some((d, j) => !Object.is(d, old.deps[j]))) {
          queued.push(() => {
            old?.cleanup?.();
            effects[i] = { deps, cleanup: cb() };
          });
        }
      },
    };
    const render = (paused = false) => {
      refIndex = stateIndex = effectIndex = 0;
      const node = Delhi({ paused });
      queued.splice(0).forEach((cb) => cb());
      return node;
    };
    const event = (target, name) => target.dispatchEvent(new Event(name));
    const visible = (value) => intersect([{ isIntersecting: value }]);
    const load = async () => {
      for (let i = 0; i < 10; i++)
        await new Promise((resolve) => setImmediate(resolve));
    };
    return {
      root,
      fill,
      window,
      document,
      media,
      requests,
      render,
      event,
      visible,
      load,
      resize: () => resize(),
      close: () => effects.forEach((e) => e.cleanup?.()),
    };
  }
  let checks = 0;
  {
    const h = harness();
    let view = h.render();
    await h.load();
    assert.equal(view.props["data-motion"], false);
    assert.equal(h.requests.length, 0);
    checks++;
    h.visible(true);
    await h.load();
    view = h.render();
    assert.equal(view.props["data-motion"], true);
    assert.equal(
      h.requests.filter((x) => x.includes("text-mask-alpha")).length,
      1,
    );
    assert.ok(
      h.requests.every((x) => x.endsWith(".webp") || x.startsWith("blob:")),
    );
    const requestCount = h.requests.length;
    checks++;
    const move = () =>
      view.props.onPointerMove({
        pointerType: "mouse",
        currentTarget: h.root,
        clientX: 520,
        clientY: 145,
      });
    move();
    assert.notEqual(h.fill.style.transform, "translate(0px, 0px)");
    view.props.onPointerCancel();
    assert.equal(h.fill.style.transform, "translate(0px,0px)");
    checks++;
    move();
    h.event(h.window, "blur");
    assert.equal(h.fill.style.transform, "translate(0px, 0px)");
    move();
    h.event(h.window, "scroll");
    assert.equal(h.fill.style.transform, "translate(0px, 0px)");
    move();
    h.resize();
    assert.equal(h.fill.style.transform, "translate(0px, 0px)");
    checks++;
    move();
    h.document.hidden = true;
    h.event(h.document, "visibilitychange");
    view = h.render();
    assert.equal(view.props["data-motion"], false);
    assert.equal(h.fill.style.transform, "translate(0px, 0px)");
    h.document.hidden = false;
    h.event(h.document, "visibilitychange");
    await h.load();
    view = h.render();
    assert.equal(view.props["data-motion"], true);
    assert.equal(h.requests.length, requestCount);
    checks++;
    move();
    h.visible(false);
    view = h.render();
    assert.equal(view.props["data-motion"], false);
    assert.equal(h.fill.style.transform, "translate(0px, 0px)");
    h.visible(true);
    await h.load();
    view = h.render();
    assert.equal(view.props["data-motion"], true);
    assert.equal(h.requests.length, requestCount);
    checks++;
    view = h.render(true);
    h.visible(true);
    await h.load();
    view = h.render(true);
    assert.equal(view.props["data-motion"], false);
    assert.equal(h.requests.length, requestCount);
    checks++;
    h.close();
  }
  {
    const h = harness(true);
    h.render();
    h.visible(true);
    await h.load();
    const view = h.render();
    assert.equal(view.props["data-motion"], false);
    assert.equal(h.requests.length, 0);
    checks++;
    h.close();
  }
  return { component: "Delhi", checks, passed: true };
}
try {
  const results = [await checkDots(), await checkDelhi()];
  console.log(
    JSON.stringify(
      {
        sourceRoot,
        kind: "mocked effect lifecycle; no browser or pixel claim",
        results,
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(output, { recursive: true, force: true });
}
