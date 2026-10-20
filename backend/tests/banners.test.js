import test from "node:test";
import assert from "node:assert/strict";
import cloudinary from "../lib/cloudinary.js";
import AdminAudit from "../models/adminAudit.model.js";
import { uploadBannerImage, validateBannerUpload, BANNER_UPLOAD_MAX_BYTES } from "../controllers/banner.controller.js";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const mockRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
};

test("validateBannerUpload: only base64 image data URLs of allowed types and size", () => {
  assert.equal(validateBannerUpload(PNG), null);
  assert.equal(validateBannerUpload("data:image/webp;base64,AAAA"), null);
  assert.match(validateBannerUpload(""), /zorunlu/);
  assert.match(validateBannerUpload(undefined), /zorunlu/);
  assert.match(validateBannerUpload("https://example.com/a.jpg"), /base64/);
  assert.match(validateBannerUpload("data:image/svg+xml;base64,AAAA"), /JPG, PNG/);
  assert.match(validateBannerUpload("data:text/plain;base64,AAAA"), /base64/);
  assert.match(validateBannerUpload(`data:image/png;base64,${"A".repeat(BANNER_UPLOAD_MAX_BYTES)}`), /büyük/);
});

test("uploadBannerImage: rejects bad input without touching Cloudinary", async (t) => {
  const upload = t.mock.method(cloudinary.uploader, "upload", async () => { throw new Error("should not be called"); });
  const res = mockRes();
  await uploadBannerImage({ body: { image: "nope" }, user: { _id: "u1" } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.success, false);
  assert.equal(upload.mock.callCount(), 0);
});

test("uploadBannerImage: uploads to the banners folder, records an audit entry and returns the url", async (t) => {
  const upload = t.mock.method(cloudinary.uploader, "upload", async (image, options) => {
    assert.equal(image, PNG);
    assert.deepEqual(options, { folder: "banners" });
    return { secure_url: "https://res.cloudinary.com/demo/image/upload/v1/banners/x.png", public_id: "banners/x", width: 1600, height: 700 };
  });
  const audits = [];
  t.mock.method(AdminAudit, "create", async (entry) => { audits.push(entry); return entry; });
  const res = mockRes();
  await uploadBannerImage({ body: { image: PNG }, user: { _id: "507f191e810c19729de860ea" }, method: "POST", originalUrl: "/api/banners/upload" }, res);
  assert.equal(upload.mock.callCount(), 1);
  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.body, { success: true, url: "https://res.cloudinary.com/demo/image/upload/v1/banners/x.png", width: 1600, height: 700 });
  await new Promise((r) => setImmediate(r));
  assert.equal(audits.length, 1);
  assert.equal(audits[0].category, "campaign");
  assert.equal(audits[0].action, "Vitrin görseli yüklendi");
});

test("uploadBannerImage: a Cloudinary failure becomes a 500 with a message", async (t) => {
  t.mock.method(cloudinary.uploader, "upload", async () => { throw new Error("network"); });
  const res = mockRes();
  await uploadBannerImage({ body: { image: PNG }, user: { _id: "u1" } }, res);
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.success, false);
});
