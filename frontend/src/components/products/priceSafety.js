// Tekil fiyat değişikliğinin güvenlik ağı: kaydetmeden önce soru (büyük sapma / indirim kalkacak)
// ve kayıttan sonra "Geri al" bildirimi. Satır içi düzenleyici, ürün çekmecesi ve fiyat bekçisi kullanır.
import { createElement } from "react";
import toast from "react-hot-toast";
import { RotateCcw } from "lucide-react";
import axios from "../../lib/axios";
import { errorMessage, money, priceChangeQuestion, toKurus } from "./productUtils";

const UNDO_MS = 10000;

/** Gerekirse onay sorar. Soru yoksa ya da "Kaydet" denirse true döner. */
export const confirmPriceChange = async (confirm, product, newPrice) => {
  const question = priceChangeQuestion(product, newPrice);
  if (!question) return true;
  return Boolean(await confirm({ ...question, confirmText: "Kaydet", cancelText: "Düzelt", type: "warning" }));
};

/**
 * Fiyatı kaydeder (PUT /products/update-price/:id).
 * @returns {{ product, previous, discountRemoved }} sunucunun döndürdüğü güncel ürün ve önceki fiyat bilgisi
 */
export const savePriceRequest = async (id, price, restoreDiscountedPrice) => {
  const body = { price };
  if (restoreDiscountedPrice !== undefined && restoreDiscountedPrice !== null) body.restoreDiscountedPrice = restoreDiscountedPrice;
  const res = await axios.put(`/products/update-price/${id}`, body);
  return res.data || {};
};

/**
 * "Fiyat ₺25,00 → ₺27,50 · Geri al" bildirimi. Geri al: eski fiyatı ve (fiyat değişikliği indirimi
 * kaldırdıysa) eski indirimi tek istekte geri yazar.
 * @param before değişiklikten önceki ürün { _id, name, price, isDiscounted, discountedPrice }
 * @param after sunucunun döndürdüğü ürün
 * @param onRestored geri alma başarılı olunca güncel ürünle çağrılır (liste/ekran güncellensin)
 * @param wrap geri alma isteğini saran işlev (Ürünler ekranı kendi işlemini canlı bildirimden ayırır)
 */
export const showPriceUndo = ({ before, after, onRestored, wrap = (fn) => fn() }) => {
  const id = before._id || before.id;
  const discountRemoved = Boolean(before.isDiscounted) && !after?.isDiscounted &&
    before.discountedPrice !== null && before.discountedPrice !== undefined &&
    toKurus(before.discountedPrice) < toKurus(before.price);
  const text = `Fiyat ${money(before.price)} → ${money(after?.price)}${discountRemoved ? ` · ${money(before.discountedPrice)} indirim kalktı` : ""}`;
  const fullName = String(before.name || "");
  const name = fullName.length > 40 ? `${fullName.slice(0, 39)}…` : fullName;
  let used = false;
  const undo = async (toastId) => {
    if (used) return;
    used = true;
    toast.dismiss(toastId);
    try {
      const data = await wrap(() => savePriceRequest(id, before.price, discountRemoved ? before.discountedPrice : undefined));
      onRestored?.(data.product || { price: before.price });
      toast.success(`Geri alındı: ${money(before.price)}${discountRemoved && data.product?.isDiscounted ? ` (indirimli ${money(data.product.discountedPrice)})` : ""}`);
    } catch (error) {
      toast.error(errorMessage(error, "Fiyat geri alınamadı"));
    }
  };
  return toast(
    (t) => createElement("span", { className: "ui-undo" },
      createElement("span", { className: "ui-undo-text" }, name ? `${name}: ${text}` : text),
      createElement("button", { type: "button", className: "ui-undo-btn", onClick: () => undo(t.id) },
        createElement(RotateCcw), "Geri al")),
    { duration: UNDO_MS, id: `price-undo-${id}` },
  );
};
