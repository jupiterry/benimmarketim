import test from "node:test";
import assert from "node:assert/strict";
import { normalizePaymentMethod, paymentMethodLabel, PAYMENT_METHOD_KEYS } from "../lib/paymentMethods.js";
import { normalizeIban, validateSettingsInput, describeSettingsChanges } from "../controllers/settings.controller.js";
import Order from "../models/order.model.js";
import User from "../models/user.model.js";

test("ödeme yöntemi anahtarları ve etiketleri", () => {
  assert.deepEqual(PAYMENT_METHOD_KEYS, ["cash", "card", "bank_transfer"]);
  assert.equal(normalizePaymentMethod(" CARD "), "card");
  assert.equal(normalizePaymentMethod("bank_transfer"), "bank_transfer");
  assert.equal(normalizePaymentMethod("bitcoin"), null);
  assert.equal(normalizePaymentMethod({ $ne: null }), null);
  assert.equal(paymentMethodLabel("cash"), "Kapıda nakit");
  assert.equal(paymentMethodLabel("card"), "Kapıda kart (POS)");
  assert.equal(paymentMethodLabel("bank_transfer"), "Havale / EFT");
  assert.equal(paymentMethodLabel(null), "Belirtilmedi");
});

test("sipariş modeli ödeme yöntemini doğrular, eski siparişlerde boş kalır", () => {
  const base = {
    user: "64b000000000000000000001", products: [], totalAmount: 100, city: "Devrek",
    phone: "05555555555", deliveryPoint: "girlsDorm",
  };
  assert.equal(new Order(base).paymentMethod, null);
  assert.equal(new Order({ ...base, paymentMethod: "card" }).validateSync(), undefined);
  assert.ok(new Order({ ...base, paymentMethod: "kripto" }).validateSync()?.errors?.paymentMethod);
});

test("havale/EFT ayarları: IBAN biçimi ve işlem kaydı", () => {
  assert.equal(normalizeIban("tr12 0006 2000 0000 0000 0000 01"), "TR120006200000000000000001");
  assert.equal(validateSettingsInput({ bankTransfer: { iban: "TR12 0006 2000 0000 0000 0000 01", accountName: "Benim Marketim" } }), null);
  assert.equal(validateSettingsInput({ bankTransfer: { iban: "" } }), null);
  assert.match(validateSettingsInput({ bankTransfer: { iban: "DE89370400440532013000" } }), /IBAN/);
  assert.match(validateSettingsInput({ bankTransfer: { iban: 123 } }), /metin/);
  assert.match(validateSettingsInput({ bankTransfer: "x" }), /havale/i);
  const changes = describeSettingsChanges({ bankTransfer: { iban: "" } }, { bankTransfer: { iban: "TR120006200000000000000001" } });
  assert.equal(changes.length, 1);
  assert.equal(changes[0].label, "Havale/EFT IBAN");
});

test("tek kelimelik isimli eski hesaplar yalnızca değişen alanla kaydedilebilir", async () => {
  const user = User.hydrate({ _id: "64b000000000000000000002", name: "Emirhan", email: "a@b.com", role: "customer" }, { password: 0 });
  user.avatar = "https://res.cloudinary.com/demo/image/upload/avatars/x.jpg";
  // Tüm belge doğrulanırsa isim kuralına takılır (eski davranış: profil fotoğrafı/telefon 500 dönüyordu)
  assert.ok(user.validateSync()?.errors?.name);
  // Yeni davranış: yalnızca değişen alan doğrulanır
  await user.validate({ validateModifiedOnly: true });
});
