import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const about = readFileSync(new URL("../src/pages/about.astro", import.meta.url), "utf8");

test("About offers WhatsApp consultation links for general and named services", () => {
  const links = [...about.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];
  const expectations = [
    ["Consultar por WhatsApp", "¡Hola! Quisiera consultar por la disponibilidad de sus productos y servicios."],
    ["Consultar", "¡Hola! Quisiera consultar por la disponibilidad de una sesión de Codificación Biológica."],
    ["Consultar", "¡Hola! Quisiera consultar por la Carta Numerológica Integral y Evolutiva y su disponibilidad."],
    ["Consultar", "¡Hola! Quisiera consultar por las tutorías individuales online: asignaturas disponibles, cupos y horarios."],
  ];

  assert.match(about, /wa\.me\/\$\{59898687061\}\?text=\$\{encodeURIComponent\(/);
  for (const [label, message] of expectations) {
    assert.ok(about.includes(JSON.stringify(message)));
    assert.ok(links.some(([_, attrs, text]) => attrs.includes("href={`https://wa.me/") && text.trim() === label));
  }
  assert.equal(links.length, 4);
});

test("About service actions keep a consistent compact, nonshrinking CTA layout", () => {
  assert.equal((about.match(/class="service-actions"/g) ?? []).length, 3);
  assert.equal((about.match(/class="whatsapp-link" aria-label="Consultar por/g) ?? []).length, 3);
  assert.match(about, /\.services-list li\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto/s);
  assert.match(about, /\.service-actions\s*\{[^}]*flex-direction:\s*column/s);
  assert.match(about, /\.service-actions\s*\{[^}]*flex:\s*none/s);
  assert.match(about, /\.whatsapp-link\s*\{[^}]*font-size:\s*0?\.875rem/s);
  assert.match(about, /\.whatsapp-link\s*\{[^}]*font-weight:\s*600/s);
  assert.match(about, /\.whatsapp-link\s*\{[^}]*white-space:\s*nowrap/s);
  assert.match(about, /\.whatsapp-link\s*\{[^}]*overflow-wrap:\s*normal/s);
  assert.match(about, /\.whatsapp-link\s*\{[^}]*box-sizing:\s*border-box/s);
});

test("About keeps tutoring conditions inside the description grid column", () => {
  const tutorStart = about.lastIndexOf("<li>", about.indexOf("Tutorías individuales online"));
  const tutor = about.slice(tutorStart, about.indexOf("</li>", tutorStart));
  assert.ok(tutor.includes('<div class="service-description">'));
  assert.ok(tutor.indexOf('<p class="tutoring-conditions">') < tutor.indexOf('</div>'));
  assert.ok(tutor.indexOf('</div>') < tutor.indexOf('<div class="service-actions">'));
  assert.match(about, /\.service-description\s*\{[^}]*min-width:\s*0/s);
  assert.match(about, /\.tutoring-conditions\s*\{[^}]*font-size:\s*0?\.875rem/s);
});

test("About shows UYU service prices and tutoring conditions with an internal contact form", () => {
  assert.match(about, /<strong>\$U 3\.200<\/strong>/g);
  assert.match(about, /<strong>\$U 500<span class="per-hour"> \/ hora<\/span><\/strong>/);
  assert.match(about, /Mínimo de 2 horas, a coordinar\./);
  const services = about.slice(about.indexOf('<section class="services-list"'), about.indexOf("</section>", about.indexOf('<section class="services-list"')));
  assert.doesNotMatch(services, /USD/);
  assert.match(about, /action="\/api\/contact"/);
  assert.match(about, /data-contact-form/);
});
