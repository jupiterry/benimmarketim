// Kampanya merkezi bağımsız incelemesinde düzeltilen davranışlar: ürün adında " · " geçen tekil flaş indirimin
// toplu kampanya sanılmaması ve kullanım sınırı dolmuş kuponun yayında / bugün biten sayılmaması.
// Veritabanı yok: yalnızca saf oluşturucular çağrılır.
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCampaignAttention,
  buildCouponItems,
  buildFlashItems,
  isExhaustedItem,
} from "../controllers/campaignCenter.controller.js";

const hex = (prefix, n) => `${prefix}${String(n).padStart(24 - prefix.length, "0")}`;
const SALE = (n) => hex("5a1e", n);
const PRODUCT = (n) => hex("90d0", n);
const COUPON = (n) => hex("c0c0", n);
const NOW = new Date("2026-11-02T18:00:00.000Z"); // İstanbul 21:00, Pazartesi

test("flaş öğeleri: ürün adında ' · ' geçen tekil kampanya ürün adıyla ve tek başına görünür", () => {
  const start = new Date("2026-11-02T10:00:00Z");
  const end = new Date("2026-11-04T10:00:00Z");
  const sales = [
    // Varsayılan adlı tekil kampanya; ürün adı " · " içeriyor
    { _id: SALE(1), product: { _id: PRODUCT(1), name: "Cips · Büyük", price: 100 }, name: "Cips · Büyük - Flash Sale",
      discountPercentage: 20, startDate: start, endDate: end, applied: true, appliedPrice: 80 },
    // Aynı tarihli başka tekil kampanya; ürün sonradan yeniden adlandırılmış ("Cips · Küçük" → "Cips Küçük")
    { _id: SALE(2), product: { _id: PRODUCT(2), name: "Cips Küçük", price: 50 }, name: "Cips · Küçük - Flash Sale",
      discountPercentage: 20, startDate: start, endDate: end, applied: true, appliedPrice: 40 },
  ];
  const items = buildFlashItems(sales, new Map(), NOW);
  assert.equal(items.length, 2, "iki tekil kampanya 'Cips' adlı tek kampanyada birleşmez");
  const big = items.find((item) => item.id === SALE(1));
  const small = items.find((item) => item.id === SALE(2));
  assert.equal(big.title, "Cips · Büyük");
  assert.equal(big.details.campaign, false);
  assert.equal(big.details.name, null, "varsayılan ad, elle verilmiş ad gibi gösterilmez");
  assert.deepEqual(big.target, { tab: "products", handoff: { key: "product", value: PRODUCT(1) } });
  assert.equal(small.title, "Cips Küçük");
  assert.equal(small.details.campaign, false);
  assert.equal(small.details.name, null, "ürünün eski adını taşıyan varsayılan ad da elle verilmiş sayılmaz");
});

test("flaş öğeleri: toplu kampanya, ürün adında ' · ' geçse de kampanya adıyla gruplanır", () => {
  const start = new Date("2026-11-02T10:00:00Z");
  const end = new Date("2026-11-02T20:00:00Z");
  const sales = [
    { _id: SALE(1), product: { _id: PRODUCT(1), name: "Cips · Büyük", price: 100 }, name: "Gece · Cips · Büyük",
      discountPercentage: 20, startDate: start, endDate: end, applied: true, appliedPrice: 80 },
    { _id: SALE(2), product: { _id: PRODUCT(2), name: "Kola", price: 50 }, name: "Gece · Kola",
      discountPercentage: 20, startDate: start, endDate: end, applied: true, appliedPrice: 40 },
  ];
  const [group] = buildFlashItems(sales, new Map(), NOW);
  assert.equal(group.title, "Gece");
  assert.equal(group.details.campaign, true);
  assert.equal(group.children.length, 2);
});

test("dikkat: fiyatı olmayan haftalık fırsat kaydı flaş indirimle '₺0' çakışması üretmez", () => {
  const child = (id, extra) => ({ id, productId: PRODUCT(1), name: "Kola", missing: false, isHidden: false, isOutOfStock: false,
    applied: true, startsAt: "2026-11-02T10:00:00.000Z", ...extra });
  const flash = [{ id: "f1", type: "flash", title: "Kola", status: "live", endsAt: "2026-11-04T10:00:00.000Z",
    target: { tab: "products" }, children: [child("a", { price: 80 })] }];
  const weekly = (weeklyPrice) => [{ id: "w1", type: "weekly", title: "Haftalık fırsatlar", status: "live", endsAt: null,
    target: { tab: "weekly-products" }, children: [child("b", { weeklyPrice, listPrice: 100, ineffective: false })] }];
  assert.deepEqual(buildCampaignAttention({ flash, weekly: weekly(null) }, NOW).map((entry) => entry.kind), []);
  assert.deepEqual(buildCampaignAttention({ flash, weekly: weekly(undefined) }, NOW).map((entry) => entry.kind), []);
  const [overlap] = buildCampaignAttention({ flash, weekly: weekly(70) }, NOW);
  assert.deepEqual([overlap.kind, overlap.effective, overlap.weeklyPrice, overlap.flashPrice], ["flash_weekly_overlap", "weekly", 70, 80]);
});

test("kupon: kullanım sınırı dolmuş kupon bugün bitse de yalnızca 'sınır doldu' uyarısı verir", () => {
  const coupons = buildCouponItems([
    { _id: COUPON(1), code: "DOLU", discountType: "fixed", discountAmount: 20, usageLimit: 5, usageCount: 5,
      expirationDate: new Date("2026-11-02T20:59:59.999Z") },
    { _id: COUPON(2), code: "GECE", discountType: "percentage", discountPercentage: 10, usageLimit: 50, usageCount: 3,
      expirationDate: new Date("2026-11-02T20:59:59.999Z") },
  ], {}, NOW);
  const [first, second] = coupons;
  assert.deepEqual([first.status, second.status], ["ending_today", "ending_today"]);
  const dolu = coupons.find((item) => item.title === "DOLU");
  const gece = coupons.find((item) => item.title === "GECE");
  assert.equal(isExhaustedItem(dolu), true);
  assert.equal(isExhaustedItem(gece), false);
  assert.equal(isExhaustedItem({ type: "flash", stats: { exhausted: true } }), false, "yalnızca kupon");

  const attention = buildCampaignAttention({ coupons }, NOW);
  assert.deepEqual(
    attention.map((entry) => [entry.kind, entry.title]).sort(),
    [["coupon_ending", "GECE"], ["coupon_exhausted", "DOLU"]],
  );
});
