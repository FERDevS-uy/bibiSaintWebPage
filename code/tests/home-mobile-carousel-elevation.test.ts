import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const carousel = readFileSync("src/components/ProductCarousel.astro", "utf8");

test("homepage mobile carousel elevates the complete product card only", () => {
  const mediaStart = carousel.indexOf("@media (max-width: 767px)");
  const desktopStart = carousel.indexOf("/* --- DESKTOP VIEW --- */", mediaStart);
  assert.ok(mediaStart >= 0 && desktopStart > mediaStart, "homepage mobile media query exists");
  const mobileBlock = carousel.slice(mediaStart, desktopStart);

  const scopedRules = [...mobileBlock.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  const declarationsFor = (selector: RegExp) => {
    const rule = scopedRules.find(([full, name]) => selector.test(name));
    assert.ok(rule, `expected scoped selector matching ${selector}`);
    return rule[2];
  };

  assert.ok(scopedRules.some(([, selector]) => /:global\(#index\)/.test(selector)));
  assert.match(declarationsFor(/\.carousel-track/), /padding-block:\s*24px\s+32px/);
  const card = declarationsFor(/\.carousel-item\s*$/);
  assert.match(card, /background:\s*#fff\s*;/i);
  assert.match(card, /box-shadow:\s*0\s+8px\s+18px\s+rgba\(35,\s*41,\s*70,\s*0?\.14\)/i);
  assert.match(declarationsFor(/\.carousel-info/), /box-sizing:\s*border-box/);
  const imageLink = declarationsFor(/\.carousel-img-link/);
  assert.match(imageLink, /box-shadow:\s*none/);
  assert.match(imageLink, /border:\s*0/);

  const beforeMobile = carousel.split(/@media\s*\(max-width:\s*767px\)/)[0];
  assert.match(beforeMobile, /\.carousel-item\s*\{[\s\S]*?transform:\s*scale\(0\.85\)/);
  assert.match(carousel, /@media screen and \(min-width: 1000px\)/);
});
