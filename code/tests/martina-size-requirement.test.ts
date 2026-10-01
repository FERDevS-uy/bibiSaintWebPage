import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.startsWith("file:") && specifier.startsWith(".")) {
      const candidates = specifier.endsWith(".js")
        ? [specifier.slice(0, -3) + ".ts"]
        : !/\.[a-z]+$/i.test(specifier)
          ? [specifier + ".ts"]
          : [];
      for (const candidate of candidates) {
        if (existsSync(fileURLToPath(new URL(candidate, context.parentURL)))) {
          return nextResolve(candidate, context);
        }
      }
    }
    return nextResolve(specifier, context);
  },
});

function mockElement(attributes: Record<string, string> = {}) {
  const classes = new Set<string>();
  return {
    textContent: "",
    innerText: "",
    value: "1",
    disabled: false,
    style: {} as Record<string, string>,
    classList: {
      add: (...tokens: string[]) =>
        tokens.forEach((token) => classes.add(token)),
      remove: (...tokens: string[]) =>
        tokens.forEach((token) => classes.delete(token)),
      contains: (token: string) => classes.has(token),
      toggle: (token: string, force?: boolean) => {
        const enabled = force ?? !classes.has(token);
        if (enabled) classes.add(token);
        else classes.delete(token);
        return enabled;
      },
    },
    getAttribute: (name: string) => attributes[name] ?? null,
    querySelectorAll: () => [],
    addEventListener: () => undefined,
  } as any;
}

test("Martina no-size response updates the live cart listener and adds without a fabricated size", async () => {
  const originals = {
    document: globalThis.document,
    localStorage: globalThis.localStorage,
    window: globalThis.window,
    fetch: globalThis.fetch,
  };
  const saved = new Map<string, string>();
  const listeners: Array<() => Promise<void>> = [];
  const addButton = mockElement({ "data-id": "mdt-42946" });
  addButton.addEventListener = (
    event: string,
    listener: () => Promise<void>,
  ) => {
    if (event === "click") listeners.push(listener);
  };
  const status = mockElement();
  const sizeButtons = [mockElement(), mockElement()];
  const sizesSelector = mockElement();
  sizesSelector.closest = () => ({ getAttribute: () => "apparel" });
  sizesSelector.querySelectorAll = () => sizeButtons;
  const sizesBlock = mockElement();
  const sizeFeedback = mockElement();
  const productPrice = mockElement();
  const elements: Record<string, any> = {
    stockCheckStatus: status,
    cartQty: mockElement({ value: "1" }),
    productPrice,
  };

  globalThis.document = {
    getElementById: (id: string) => elements[id] ?? null,
    querySelector: (selector: string) => {
      if (selector === ".name") return productName;
      if (selector === ".gallery .mainImg") return { src: "/bag.jpg" };
      return null;
    },
  } as any;
  const productName = mockElement();
  productName.innerText = "ARTEMISA BOLSO";
  globalThis.localStorage = {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => saved.set(key, value),
  } as any;
  globalThis.window = { updateCartCount: () => undefined } as any;
  globalThis.fetch = async () =>
    ({
      ok: true,
      json: async () => ({ martina: 1 }),
    }) as any;

  try {
    const [
      { handleMartina },
      { bindAddToCartListener },
      { createInitialState },
    ] = await Promise.all([
      import("../src/client/productDetail/liveStock/martina.ts"),
      import("../src/client/productDetail/productCart.ts"),
      import("../src/client/productDetail/state.ts"),
    ]);
    const state = createInitialState();
    state.addBtn = addButton;
    state.requiresSizeSelection = true;
    state.selectedSize = "M";
    sizeButtons[0].classList.add("selected");

    // The actual app binds the click listener before the asynchronous live check.
    bindAddToCartListener(state, {
      sizesSelector,
      sizeFeedback,
      requiresSizeSelection: state.requiresSizeSelection,
    });

    await handleMartina(
      {
        provider: "martina",
        price: "1.110",
        inStock: true,
        colors: [
          {
            id: 1345,
            name: "DENIM",
            hex: "#5E7288",
            rawSizes: ["/"],
            sizes: [],
          },
        ],
        sizes: [],
      },
      {
        state,
        checkStockBtn: mockElement(),
        statusEl: status,
        stockBadge: mockElement(),
        priceEl: productPrice,
        originalPriceEl: mockElement(),
        sizesSelector,
        colorsBlock: mockElement(),
        colorsSelector: null,
        colorNameEl: null,
        sizeFeedback,
        setSizeRequirement: (required) => {
          state.requiresSizeSelection = required;
          sizesBlock.classList.toggle("hidden", !required);
          if (!required) {
            state.selectedSize = "";
            sizeFeedback.classList.add("hidden");
            sizeButtons.forEach((button) => {
              button.classList.remove("selected", "unavailable");
              button.disabled = false;
            });
          }
        },
        renderNormalizedSizes: () => undefined,
        markUnavailableSizes: () => undefined,
        renderColors: () => undefined,
        applyColorSelection: () => undefined,
        providerLink: "https://pol21.martinaditrento.com/",
      },
    );

    assert.equal(state.requiresSizeSelection, false);
    assert.equal(sizesBlock.classList.contains("hidden"), true);
    assert.equal(state.selectedSize, "");
    assert.equal(sizeButtons[0].classList.contains("selected"), false);
    assert.equal(state.selectedColorId, 1345);

    await listeners[0]();

    const cart = JSON.parse(saved.get("carrito") ?? "[]");
    assert.equal(cart.length, 1);
    assert.equal(cart[0].id, "mdt-42946__c1345");
    assert.equal(cart[0].name, "ARTEMISA BOLSO");
  } finally {
    globalThis.document = originals.document;
    globalThis.localStorage = originals.localStorage;
    globalThis.window = originals.window;
    globalThis.fetch = originals.fetch;
  }
});
