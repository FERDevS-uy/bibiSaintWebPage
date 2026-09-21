import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_IMAGE_FILE_SIZE_BYTES,
  MAX_PRODUCT_IMAGES,
  validateImageUploadBatch,
} from "../src/utils/adminImageUpload.ts";

const file = (name: string, size = 512, type = "image/jpeg") => ({ name, size, type });

test("accepts only the remaining gallery slots from a bulk selection", () => {
  const result = validateImageUploadBatch(
    [file("first.jpg"), file("second.png"), file("third.webp")],
    MAX_PRODUCT_IMAGES - 2,
  );

  assert.deepEqual(result.validFiles.map((item) => item.name), ["first.jpg", "second.png"]);
  assert.equal(result.rejectedFiles.length, 1);
  assert.match(result.rejectedFiles[0].reason, /máximo de 20 imágenes/i);
});

test("rejects each file larger than 1 MB without blocking valid files", () => {
  const result = validateImageUploadBatch([
    file("too-large.jpg", MAX_IMAGE_FILE_SIZE_BYTES + 1),
    file("valid.jpg"),
  ]);

  assert.deepEqual(result.validFiles.map((item) => item.name), ["valid.jpg"]);
  assert.match(result.rejectedFiles[0].reason, /1 MB/);
});

test("rejects unsupported file formats", () => {
  const result = validateImageUploadBatch([file("document.pdf", 100, "application/pdf")]);

  assert.equal(result.validFiles.length, 0);
  assert.match(result.rejectedFiles[0].reason, /Formato no soportado/);
});
