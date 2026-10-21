// Siparişler ekranının yardımcıları: fiş / toplama listesi yazdırma, Excel'e (CSV)
// aktarma, telefon biçimleme ve Türkçe uyumlu arama. Ağ isteği yapmaz, durum tutmaz.

// ── Metin ve sayı ─────────────────────────────────────────────────────────────
const ORDER_PAYMENT_LABELS = { cash: "Kapıda nakit", card: "Kapıda kart (POS)", bank_transfer: "Havale / EFT" };
/** Siparişin ödeme yöntemi etiketi (eski siparişlerde "Belirtilmedi") */
export const orderPaymentLabel = (order) => order?.paymentMethodLabel || ORDER_PAYMENT_LABELS[order?.paymentMethod] || "Belirtilmedi";

// Hesabı silinmiş müşterinin siparişleri: fiş, özet, toplama listesi ve kurye fişinde ad yerine bu yazılır;
// müşteriye giden metinlerde ad hiç kullanılmaz ("Merhaba,").
export const DELETED_CUSTOMER_LABEL = "Müşteri (hesap silinmiş)";
const isDeletedAccount = (order) => Boolean(order?.user?.deleted || order?.userDeleted);
/** Yazdırılan / kopyalanan metindeki müşteri adı (silinmiş hesapta DELETED_CUSTOMER_LABEL) */
const printableCustomer = (order, fallback) => (isDeletedAccount(order) ? DELETED_CUSTOMER_LABEL : order?.user?.name || fallback);


// HTML'e yazılan müşteri notu, ürün adı vb. kod olarak çalışmasın diye kaçırılır
export const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
));

export const formatMoney = (value) =>
  `₺${Number(value || 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// "İlker" / "ILIK" gibi Türkçe harfler String#toLowerCase ile yanlış küçülür
// ("İ" → "i̇"). Arama hem Türkçe küçük harfe çevirir hem de aksanları sadeleştirir;
// böylece "ilker", "İLKER" ve "Ilker" aynı sonucu verir; "cagla" da "Çağla"yı bulur.
export const normalizeSearch = (value) =>
  String(value ?? "")
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export const onlyDigits = (value) => String(value ?? "").replace(/\D/g, "");

export const shortOrderId = (orderId, length = 6) => String(orderId || "").slice(-length).toUpperCase();

// ── Telefon ───────────────────────────────────────────────────────────────────

// Türkiye cep/sabit numarasını 10 haneli ulusal biçime indirir (5XX XXX XX XX).
const toNationalTen = (phone) => {
  const digits = onlyDigits(phone);
  if (digits.length === 12 && digits.startsWith("90")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  if (digits.length === 10) return digits;
  return null;
};

// "0555 123 45 67" biçimi; tanınmayan numara olduğu gibi döner
export const formatPhoneTR = (phone) => {
  const ten = toNationalTen(phone);
  if (!ten) return String(phone ?? "").trim();
  return `0${ten.slice(0, 3)} ${ten.slice(3, 6)} ${ten.slice(6, 8)} ${ten.slice(8, 10)}`;
};

// wa.me bağlantısı için ülke koduyla: 905551234567
export const toWhatsAppNumber = (phone) => {
  const ten = toNationalTen(phone);
  return ten ? `90${ten}` : null;
};

// ── Sipariş süreleri ──────────────────────────────────────────────────────────

// Durum geçmişinden bir durumun ilk kez ne zaman verildiğini bulur
export const getStatusTime = (order, status) => {
  const entry = (order?.statusHistory || []).find((item) => item?.status === status && item?.changedAt);
  if (!entry) return null;
  const date = new Date(entry.changedAt);
  return Number.isNaN(date.getTime()) ? null : date;
};

// Siparişin verildiği andan teslim edildiği ana kadar geçen dakika (geçmiş yoksa null)
export const getDeliveryMinutes = (order) => {
  if (order?.status !== "Teslim Edildi") return null;
  const created = new Date(order.createdAt);
  const delivered = getStatusTime(order, "Teslim Edildi");
  if (!delivered || Number.isNaN(created.getTime())) return null;
  const minutes = Math.round((delivered - created) / 60000);
  return minutes >= 0 && minutes < 24 * 60 ? minutes : null;
};

// ── Fiş (termal etiket, 76 × 127 mm) ─────────────────────────────────────────

// Termal yazıcı yalnızca siyah/beyaz basar: renk, gri ve emoji noktalı (silik)
// çıkar. Fişte yalnızca düz siyah metin ve çizgi kullanılır.
const RECEIPT_CSS = `
        <style>
          @page { size: 76mm 127mm; margin: 0; }
          html, body {
            width: 76mm;
            height: 127mm;
            margin: 0;
            padding: 0;
          }
          body {
            font-family: Arial, sans-serif;
            color: #000;
            line-height: 1.25;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .receipt {
            width: 76mm;
            height: 127mm;
            box-sizing: border-box;
            padding: 4mm 5mm;
            overflow: hidden;
          }
          .header { text-align: center; }
          .brand { font-size: 15px; font-weight: bold; letter-spacing: 0.5px; }
          .order-no { font-size: 20px; font-weight: bold; margin-top: 2px; }
          .meta { font-size: 11px; }
          .flag { font-size: 11px; font-weight: bold; }
          .point {
            margin: 5px 0 4px;
            padding: 3px 4px;
            border: 2px solid #000;
            text-align: center;
            font-size: 15px;
            font-weight: bold;
            text-transform: uppercase;
            word-break: break-word;
          }
          .row {
            display: flex;
            justify-content: space-between;
            font-size: 11px;
            margin: 2px 0;
            gap: 8px;
          }
          .row > div:last-child { text-align: right; word-break: break-word; }
          .strong > div:last-child { font-weight: bold; }
          .phone > div:last-child { font-size: 14px; font-weight: bold; }
          .note {
            margin: 5px 0 2px;
            padding: 3px 5px;
            border: 1.5px dashed #000;
            font-size: 12px;
            font-weight: bold;
            word-break: break-word;
          }
          .rule { border-top: 1px dashed #000; margin: 5px 0; }
          .rule-solid { border-top: 2px solid #000; margin: 5px 0; }
          .item {
            display: grid;
            grid-template-columns: auto 1fr auto;
            column-gap: 6px;
            font-size: 11px;
            margin: 3px 0;
            align-items: start;
          }
          .item .qty { font-weight: bold; min-width: 22px; }
          .item .name { word-break: break-word; }
          .item .unit { font-size: 10px; }
          .item .price { text-align: right; font-weight: bold; white-space: nowrap; }
          .count { font-size: 10px; text-align: right; }
          .discount { font-weight: bold; }
          .total {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            font-size: 18px;
            font-weight: bold;
          }
          .footer { text-align: center; margin-top: 6px; }
          .footer div { font-size: 10px; font-weight: bold; margin-top: 2px; }
          * { page-break-inside: avoid; }
        </style>
      `;

// Birden fazla fiş tek seferde basılırken her fiş kendi etiketine düşer
const MULTI_RECEIPT_CSS = `
        <style>
          html, body { height: auto; }
          .receipt { break-after: page; page-break-after: always; }
          .receipt:last-child { break-after: auto; page-break-after: auto; }
        </style>
      `;

// Tek bir siparişin fiş gövdesi (".receipt" kutusu)
export const buildReceiptBody = (order) => {
  const esc = escapeHtml;
  const money = formatMoney;

  const createdAt = new Date(order.createdAt).toLocaleString("tr-TR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
  const shortId = String(order.orderId || order._id || "").slice(-6).toUpperCase();
  const products = order.products || [];
  const unitCount = products.reduce((sum, p) => sum + (Number(p.quantity) || 0), 0);

  // Fiyat birim fiyattır; satırda adet × birim fiyat tutarı gösterilir
  const itemsHtml = products.map((p) => {
    const qty = Number(p.quantity) || 0;
    const unit = Number(p.price || 0);
    return `
        <div class="item">
          <div class="qty">${qty}x</div>
          <div class="name">${esc(p.name)}${qty > 1 ? `<div class="unit">${qty} × ${money(unit)}</div>` : ""}</div>
          <div class="price">${money(unit * qty)}</div>
        </div>
      `;
  }).join("");

  const deliveryInfo = order.deliveryPointName || order.city || "Teslimat noktası belirtilmemiş";
  const phone = order.phone || order.user?.phone || "-";
  // userOrderCount siparişin müşteri geçmişindeki sırasıdır (0 = bilinmiyor → bayrak yok). Sunucu
  // istatistiğinden gelen isFirstOrder kesin bilgidir: true ise sıra bilinmese de bayrak basılır,
  // false ise sıra 1 görünse bile basılmaz. Alanı olmayan eski çağrılar eskisi gibi çalışır.
  const orderCount = Number(order.userOrderCount) || 0;
  const firstOrder = order.isFirstOrder === true || (order.isFirstOrder !== false && orderCount === 1);
  const flagHtml = firstOrder
    ? '<div class="flag">* İLK SİPARİŞ *</div>'
    : orderCount > 1 ? `<div class="meta">Müşterinin ${orderCount}. siparişi</div>` : "";
  const noteHtml = order.note && String(order.note).trim()
    ? `<div class="note">NOT: ${esc(String(order.note).trim())}</div>`
    : "";
  const discountHtml = order.couponCode ? `
              <div class="row"><div>Ara Toplam</div><div>${money(order.subtotalAmount || order.totalAmount)}</div></div>
              <div class="row discount"><div>Kupon indirimi (${esc(order.couponCode)})</div><div>-${money(order.couponDiscount)}</div></div>
      ` : "";

  return `
            <div class="receipt">
              <div class="header">
                <div class="brand">BENİM MARKETİM</div>
                <div class="order-no">#${esc(shortId)}</div>
                <div class="meta">${esc(createdAt)}</div>
                ${flagHtml}
              </div>
              <div class="point">${esc(deliveryInfo)}</div>
              <div class="row strong"><div>Müşteri</div><div>${esc(printableCustomer(order, "-"))}</div></div>
              <div class="row phone"><div>Telefon</div><div>${esc(phone)}</div></div>
              ${order.user?.address ? `<div class="row"><div>Adres</div><div>${esc(order.user.address)}</div></div>` : ""}
              ${noteHtml}
              <div class="rule"></div>
              ${itemsHtml}
              <div class="count">${products.length} çeşit · ${unitCount} adet</div>
              <div class="rule"></div>
              ${discountHtml}
              <div class="rule-solid"></div>
              <div class="total"><div>TOPLAM</div><div>${money(order.totalAmount)}</div></div>
              ${order.paymentMethod ? `<div class="row strong"><div>Ödeme</div><div>${esc(orderPaymentLabel(order))}</div></div>` : ""}
              <div class="rule-solid"></div>
              <div class="footer">
                <div>Bizi tercih ettiğiniz için teşekkür ederiz!</div>
                <div>Uygulamayı güncellemeyi unutmayın!</div>
              </div>
            </div>`;
};

// Fiş tek etikete sığmıyorsa yazı küçültülür. Kutu genişletilip yeniden ölçülür,
// yazı en fazla %60'a iner, daha uzunsa fiş bir sonraki etikete devam eder.
// Birden fazla fişte aynı işlem her fiş için ayrı yapılır.
const RECEIPT_FIT_SCRIPT = `
            <script>
              window.onload = function(){
                try {
                  document.querySelectorAll('.receipt').forEach(function(el){
                    const width = el.clientWidth;
                    const maxH = el.clientHeight;
                    const MIN_SCALE = 0.6;
                    el.style.height = 'auto';
                    el.style.overflow = 'visible';
                    let scale = 1;
                    for (let i = 0; i < 8 && el.offsetHeight * scale > maxH + 1; i++) {
                      scale = Math.max(MIN_SCALE, maxH / el.offsetHeight);
                      el.style.width = (width / scale) + 'px';
                      if (scale === MIN_SCALE) break;
                    }
                    if (scale < 1) el.style.zoom = String(scale);
                    if (el.offsetHeight * scale > maxH + 1) {
                      document.documentElement.style.height = 'auto';
                      document.body.style.height = 'auto';
                    } else {
                      el.style.height = (maxH / scale) + 'px';
                      el.style.overflow = 'hidden';
                    }
                  });
                } catch(e){}
                window.print();
                setTimeout(()=>window.close(), 500);
              }
            </script>`;

// Bir ya da birden çok siparişin fişlerini içeren yazdırma belgesi
export const buildReceiptDocument = (orders, { autoPrint = true } = {}) => {
  const list = (Array.isArray(orders) ? orders : [orders]).filter(Boolean);
  const title = list.length === 1
    ? `Sipariş #${escapeHtml(shortOrderId(list[0].orderId || list[0]._id))}`
    : `${list.length} sipariş fişi`;
  return `
        <html>
          <head><meta charset="utf-8"/><title>${title}</title>${RECEIPT_CSS}${list.length > 1 ? MULTI_RECEIPT_CSS : ""}</head>
          <body>${list.map(buildReceiptBody).join("")}${autoPrint ? RECEIPT_FIT_SCRIPT : ""}
          </body>
        </html>
      `;
};

// Yazdırma penceresini açar; açılır pencere engellendiyse false döner
const writePrintWindow = (html, features = "width=400,height=700") => {
  const printWindow = window.open("", "_blank", features);
  if (!printWindow) return false;
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  return true;
};

export const printReceipts = (orders) => writePrintWindow(buildReceiptDocument(orders));

// ── Toplama listesi ───────────────────────────────────────────────────────────

// Ürün satırlarının kararlı anahtarları. Zenginleştirilmiş siparişte product.lineKey hazırdır; yoksa
// shared.js lineKey + enrichOrders ile birebir aynı şema kullanılır: "l:<lineId>" ya da
// "n:<ad>|<birim fiyat 2 hane>", aynı siparişte tekrar edenlere "#2", "#3".
// (shared.js bu dosyayı içe aktardığı için oradan çağrılamaz; döngüsel bağımlılık olur.)
const roundMoney = (n) => Math.round((Number(n) || 0) * 100) / 100;
const orderLineKeys = (order) => {
  const seen = new Map();
  return (order?.products || []).map((p) => {
    if (p?.lineKey) return String(p.lineKey);
    const base = p?.lineId ? `l:${p.lineId}` : `n:${normalizeSearch(p?.name)}|${roundMoney(p?.price).toFixed(2)}`;
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return n > 1 ? `${base}#${n}` : base;
  });
};

// Siparişlerdeki ürünleri adına göre toplar: kaç adet, kaç siparişte, hangi siparişlerde.
// Ayrıca teslimat noktasına göre dağıtım özeti çıkarır. Her sipariş referansı o siparişteki
// satır anahtarlarını (lineKeys) taşır; toplama işaretleri sipariş satırı bazında saklanır.
export const buildPickingList = (orders) => {
  const items = new Map();
  const points = new Map();
  let unitCount = 0;

  for (const order of orders || []) {
    const shortId = shortOrderId(order.orderId);
    const customer = printableCustomer(order, "Müşteri");
    const lineKeys = orderLineKeys(order);
    (order.products || []).forEach((product, index) => {
      const name = String(product?.name || "Bilinmeyen ürün").trim();
      const key = normalizeSearch(name);
      const qty = Number(product?.quantity) || 0;
      unitCount += qty;
      if (!items.has(key)) items.set(key, { key, name, image: product?.image || null, quantity: 0, orders: [] });
      const item = items.get(key);
      if (!item.image && product?.image) item.image = product.image;
      item.quantity += qty;
      const existing = item.orders.find((entry) => entry.orderId === order.orderId);
      if (existing) {
        existing.quantity += qty;
        existing.lineKeys.push(lineKeys[index]);
      } else {
        item.orders.push({ orderId: order.orderId, shortId, quantity: qty, customer, lineKeys: [lineKeys[index]] });
      }
    });

    const pointName = order.deliveryPointName || order.city || "Belirtilmemiş";
    if (!points.has(pointName)) points.set(pointName, { name: pointName, orders: [], total: 0 });
    const point = points.get(pointName);
    point.orders.push({
      orderId: order.orderId,
      shortId,
      customer,
      phone: order.phone || order.user?.phone || "",
      total: Number(order.totalAmount) || 0,
      status: order.status,
      paymentMethod: order.paymentMethod || null,
      paymentLabel: orderPaymentLabel(order),
    });
    point.total += Number(order.totalAmount) || 0;
  }

  const collator = new globalThis.Intl.Collator("tr-TR", { sensitivity: "base", numeric: true });
  return {
    orderCount: (orders || []).length,
    unitCount,
    items: [...items.values()].sort((a, b) => collator.compare(a.name, b.name)),
    points: [...points.values()].sort((a, b) => collator.compare(a.name, b.name)),
  };
};

const PICKING_CSS = `
        <style>
          @page { size: 76mm 127mm; margin: 4mm 0; }
          html, body { width: 76mm; margin: 0; padding: 0; }
          body { font-family: Arial, sans-serif; color: #000; line-height: 1.25; padding: 0 5mm; box-sizing: border-box; }
          h1 { font-size: 15px; text-align: center; margin: 0; letter-spacing: 0.5px; }
          .meta { font-size: 10px; text-align: center; margin-top: 2px; }
          .rule { border-top: 1px dashed #000; margin: 5px 0; }
          .rule-solid { border-top: 2px solid #000; margin: 6px 0 5px; }
          .item { display: grid; grid-template-columns: 12px 28px 1fr; column-gap: 5px; font-size: 12px; margin: 4px 0; page-break-inside: avoid; }
          .box { width: 10px; height: 10px; border: 1.5px solid #000; margin-top: 2px; }
          .qty { font-weight: bold; font-size: 13px; }
          .name { font-weight: bold; word-break: break-word; }
          .who { grid-column: 3; font-size: 10px; word-break: break-word; }
          h2 { font-size: 12px; margin: 0 0 3px; text-transform: uppercase; }
          .point { margin: 0 0 6px; page-break-inside: avoid; }
          .point-head { display: flex; justify-content: space-between; font-size: 12px; font-weight: bold; border-bottom: 1px solid #000; padding-bottom: 1px; }
          .order { display: flex; justify-content: space-between; gap: 6px; font-size: 10px; margin: 2px 0; }
          .order span:last-child { white-space: nowrap; }
        </style>
      `;

export const buildPickingDocument = (picking, { autoPrint = true } = {}) => {
  const esc = escapeHtml;
  const now = new Date().toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const itemsHtml = picking.items.map((item) => `
          <div class="item">
            <div class="box"></div>
            <div class="qty">${item.quantity}x</div>
            <div class="name">${esc(item.name)}</div>
            <div class="who">${item.orders.map((o) => `#${esc(o.shortId)}${o.quantity > 1 ? ` ×${o.quantity}` : ""}`).join(" · ")}</div>
          </div>`).join("");
  const pointsHtml = picking.points.map((point) => `
          <div class="point">
            <div class="point-head"><span>${esc(point.name)} (${point.orders.length})</span><span>${formatMoney(point.total)}</span></div>
            ${point.orders.map((o) => `<div class="order"><span>#${esc(o.shortId)} ${esc(o.customer)}</span><span>${esc(formatPhoneTR(o.phone) || "-")}</span></div>`).join("")}
          </div>`).join("");
  return `
        <html>
          <head><meta charset="utf-8"/><title>Toplama listesi</title>${PICKING_CSS}</head>
          <body>
            <h1>TOPLAMA LİSTESİ</h1>
            <div class="meta">${esc(now)} · ${picking.orderCount} sipariş · ${picking.items.length} çeşit · ${picking.unitCount} adet</div>
            <div class="rule-solid"></div>
            ${itemsHtml}
            <div class="rule-solid"></div>
            <h2>Teslimat</h2>
            ${pointsHtml}
            ${autoPrint ? "<script>window.onload=function(){window.print();setTimeout(function(){window.close()},500)}</script>" : ""}
          </body>
        </html>
      `;
};

export const printPickingList = (picking) => writePrintWindow(buildPickingDocument(picking));

// ── Excel'e aktarma (CSV) ─────────────────────────────────────────────────────

// Türkçe Excel ";" ayırıcı ve virgüllü ondalık bekler; BOM ile Türkçe karakterler bozulmaz.
// "=", "+", "-", "@" ile başlayan metinler formül olarak çalışmasın diye başına ' eklenir.
const csvCell = (value) => {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};
const csvNumber = (value) => (Number(value) || 0).toFixed(2).replace(".", ",");

export const ORDER_CSV_COLUMNS = [
  "Sipariş No", "Tarih", "Saat", "Müşteri", "Telefon", "E-posta", "Teslimat Noktası", "Ödeme", "Durum",
  "Çeşit", "Adet", "Ara Toplam", "Kupon", "İndirim", "Toplam", "Teslim Süresi (dk)", "Müşteri Notu", "Teslimat Takibi", "Ürünler",
];

export const buildOrdersCsv = (orders) => {
  const rows = (orders || []).map((order) => {
    const created = new Date(order.createdAt);
    const valid = !Number.isNaN(created.getTime());
    const products = order.products || [];
    return [
      csvCell(`#${shortOrderId(order.orderId, 8)}`),
      csvCell(valid ? created.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" }) : ""),
      csvCell(valid ? created.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) : ""),
      csvCell(order.user?.name || ""),
      csvCell(formatPhoneTR(order.phone || order.user?.phone || "")),
      csvCell(order.user?.email || ""),
      csvCell(order.deliveryPointName || order.city || ""),
      csvCell(orderPaymentLabel(order)),
      csvCell(order.status || ""),
      products.length,
      products.reduce((sum, p) => sum + (Number(p.quantity) || 0), 0),
      csvNumber(order.subtotalAmount || order.totalAmount),
      csvCell(order.couponCode || ""),
      csvNumber(order.couponDiscount || 0),
      csvNumber(order.totalAmount),
      getDeliveryMinutes(order) ?? "",
      csvCell(order.note || ""),
      csvCell(order.deliveryTracking || ""),
      csvCell(products.map((p) => `${p.name} x${p.quantity}`).join(", ")),
    ].join(";");
  });
  return `\uFEFF${ORDER_CSV_COLUMNS.map(csvCell).join(";")}\r\n${rows.join("\r\n")}`;
};

export const downloadTextFile = (content, filename, type = "text/csv;charset=utf-8") => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// ── Paylaşım metni (kuryeye / mesaja yapıştırmak için) ────────────────────────
export const buildOrderSummaryText = (order) => {
  const lines = [
    `#${shortOrderId(order.orderId)} · ${order.deliveryPointName || order.city || "Teslimat noktası yok"}`,
    `${printableCustomer(order, "Müşteri")} · ${formatPhoneTR(order.phone || order.user?.phone || "") || "-"}`,
    ...(order.products || []).map((p) => `- ${p.quantity} x ${p.name}`),
    `Toplam: ${formatMoney(order.totalAmount)}`,
    ...(order.paymentMethod ? [`Ödeme: ${orderPaymentLabel(order)}`] : []),
  ];
  if (order.note && String(order.note).trim()) lines.push(`Not: ${String(order.note).trim()}`);
  return lines.join("\n");
};

// Müşteriye WhatsApp'tan gönderilecek hazır mesaj (duruma göre)
export const buildWhatsAppMessage = (order) => {
  // Silinmiş hesapta "Silinmiş" diye selamlanmasın: ad kullanılmaz
  const firstName = isDeletedAccount(order) ? "" : String(order.user?.name || "").trim().split(/\s+/)[0] || "";
  const greeting = firstName ? `Merhaba ${firstName},` : "Merhaba,";
  const no = `#${shortOrderId(order.orderId)}`;
  const byStatus = {
    "Hazırlanıyor": `${no} numaralı siparişinizi hazırlıyoruz.`,
    "Yolda": `${no} numaralı siparişiniz yola çıktı, birazdan ${order.deliveryPointName || "teslimat noktanızda"} olacak.`,
    "Teslim Edildi": `${no} numaralı siparişiniz teslim edildi. Afiyet olsun!`,
    "İptal Edildi": `${no} numaralı siparişiniz hakkında yazıyoruz.`,
  };
  return `${greeting} Benim Marketim'den yazıyoruz. ${byStatus[order.status] || `${no} numaralı siparişiniz hakkında yazıyoruz.`}`;
};

// ── Gün sonu ve kurye fişi ────────────────────────────────────────────────────
// "Bugün" İstanbul günüdür (sabit UTC+3, backend startOfTrDay ve shared.startOfDay ile aynı hesap).
// shared.js bu dosyayı içe aktardığı için zaman yardımcıları burada yerel olarak tekrarlanır.
const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const TR_OFFSET_MS = 3 * 60 * MINUTE_MS;
const TR_TZ = "Europe/Istanbul";
const toTime = (value) => {
  if (value === null || value === undefined || value === "") return NaN;
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  return new Date(value).getTime();
};
const trDayStart = (value) => Math.floor((toTime(value) + TR_OFFSET_MS) / DAY_MS) * DAY_MS - TR_OFFSET_MS;
const createdTime = (order) => (Number.isFinite(order?.createdMs) && order.createdMs > 0 ? order.createdMs : toTime(order?.createdAt));
// Bir durumun EN SON verildiği an (ms | null)
const lastStatusMs = (order, status) => {
  let best = null;
  for (const entry of order?.statusHistory || []) {
    if (entry?.status !== status) continue;
    const ms = toTime(entry.changedAt);
    if (Number.isFinite(ms) && (best === null || ms > best)) best = ms;
  }
  return best;
};
const withinDayMinutes = (from, to) => {
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  const minutes = Math.round((to - from) / MINUTE_MS);
  return minutes >= 0 && minutes < 24 * 60 ? minutes : null;
};
const averageMinutes = (list) => (list.length ? Math.round(list.reduce((sum, v) => sum + v, 0) / list.length) : null);
const DAY_PAYMENTS = [
  ["cash", "Kapıda nakit"], ["card", "Kapıda kart (POS)"], ["bank_transfer", "Havale / EFT"], ["none", "Belirtilmemiş"],
];
const paymentMethodKey = (order) => (ORDER_PAYMENT_LABELS[order?.paymentMethod] ? order.paymentMethod : "none");
const KNOWN_POINTS = { girlsDorm: "Kız KYK Yurdu", boysDorm: "Erkek KYK Yurdu" };
const orderPointName = (order) =>
  KNOWN_POINTS[order?.deliveryPoint] || String(order?.deliveryPointName || order?.city || "").trim() || "Belirtilmemiş";
const isOpenStatus = (status) => status === "Hazırlanıyor" || status === "Yolda";

/**
 * Gün sonu özeti. Sayılar ve ciro BUGÜN (İstanbul) OLUŞTURULAN siparişlerden; kasa sayımı
 * (deliveredCash) ise oluşturulma gününden bağımsız olarak son "Teslim Edildi" kaydı bugün olan
 * nakit siparişlerden hesaplanır (23:50'de verilip 00:10'da teslim edilen sipariş teslim gününe yazılır).
 * → { dayStart, generatedAt, count, valid, delivered, cancelled, revenue, avgBasket, cancelledTotal,
 *     couponTotal, manualTotal, byPayment:[{method,label,count,total}], byPoint:[{name,count,total}],
 *     avgPrep, avgRoad, avgTotal, deliveredCash, deliveredCashCount, open (tüm aktifler, en eski önce),
 *     + openPrep, openRoad, openCash, openCashCount, pendingToday, deliveredToday, deliveredTodayTotal,
 *       deliveredCard, deliveredCardCount, deliveredTransfer, deliveredTransferCount, todayOrders }
 */
export const buildDayCloseSummary = (orders, now = Date.now(), { dayStart } = {}) => {
  const nowMs = Number.isFinite(toTime(now)) ? toTime(now) : Date.now();
  const startMs = Number.isFinite(toTime(dayStart)) ? toTime(dayStart) : trDayStart(nowMs);
  const endMs = startMs + DAY_MS;
  const list = (orders || []).filter(Boolean);
  const inDay = (ms) => Number.isFinite(ms) && ms >= startMs && ms < endMs;

  const todayOrders = list.filter((order) => inDay(createdTime(order)));
  const payments = new Map(DAY_PAYMENTS.map(([method, label]) => [method, { method, label, count: 0, total: 0 }]));
  const points = new Map();
  const preps = [];
  const roads = [];
  const totals = [];
  let valid = 0;
  let delivered = 0;
  let cancelled = 0;
  let revenue = 0;
  let cancelledTotal = 0;
  let couponTotal = 0;
  let manualTotal = 0;

  for (const order of todayOrders) {
    const amount = Number(order.totalAmount) || 0;
    if (order.status === "İptal Edildi") {
      cancelled += 1;
      cancelledTotal += amount;
      continue;
    }
    valid += 1;
    revenue += amount;
    if (order.couponCode) couponTotal += Number(order.couponDiscount) || 0;
    for (const product of order.products || []) {
      if (product?.isManual) manualTotal += (Number(product.price) || 0) * (Number(product.quantity) || 0);
    }
    const payment = payments.get(paymentMethodKey(order));
    payment.count += 1;
    payment.total += amount;
    const pointName = orderPointName(order);
    if (!points.has(pointName)) points.set(pointName, { name: pointName, count: 0, total: 0 });
    const point = points.get(pointName);
    point.count += 1;
    point.total += amount;

    const created = createdTime(order);
    const onWayFirst = getStatusTime(order, "Yolda")?.getTime();
    const prep = withinDayMinutes(created, onWayFirst);
    if (prep !== null) preps.push(prep);
    if (order.status === "Teslim Edildi") {
      delivered += 1;
      const deliveredAt = lastStatusMs(order, "Teslim Edildi");
      if (deliveredAt !== null) {
        let onWay = null;
        for (const entry of order.statusHistory || []) {
          const ms = toTime(entry?.changedAt);
          if (entry?.status === "Yolda" && Number.isFinite(ms) && ms <= deliveredAt && (onWay === null || ms > onWay)) onWay = ms;
        }
        const road = onWay === null ? null : withinDayMinutes(onWay, deliveredAt);
        if (road !== null) roads.push(road);
        const total = withinDayMinutes(created, deliveredAt);
        if (total !== null) totals.push(total);
      }
    }
  }

  // Kasa: bugün teslim edilenler (teslim anına göre; geçmiş yoksa updatedAt)
  let deliveredToday = 0;
  let deliveredTodayTotal = 0;
  const collected = { cash: [0, 0], card: [0, 0], bank_transfer: [0, 0] };
  for (const order of list) {
    if (order.status !== "Teslim Edildi") continue;
    const at = lastStatusMs(order, "Teslim Edildi") ?? toTime(order.updatedAt);
    if (!inDay(at)) continue;
    const amount = Number(order.totalAmount) || 0;
    deliveredToday += 1;
    deliveredTodayTotal += amount;
    const bucket = collected[order.paymentMethod];
    if (bucket) {
      bucket[0] += amount;
      bucket[1] += 1;
    }
  }

  const open = list.filter((order) => isOpenStatus(order.status))
    .sort((a, b) => (createdTime(a) || 0) - (createdTime(b) || 0));
  let openCash = 0;
  let openCashCount = 0;
  for (const order of open) {
    if (order.status === "Yolda" && order.paymentMethod === "cash") {
      openCash += Number(order.totalAmount) || 0;
      openCashCount += 1;
    }
  }

  const collator = new globalThis.Intl.Collator("tr-TR", { sensitivity: "base", numeric: true });
  revenue = roundMoney(revenue);
  return {
    dayStart: new Date(startMs),
    generatedAt: new Date(nowMs),
    count: todayOrders.length,
    valid,
    delivered,
    cancelled,
    pendingToday: valid - delivered,
    revenue,
    avgBasket: valid ? roundMoney(revenue / valid) : 0,
    cancelledTotal: roundMoney(cancelledTotal),
    couponTotal: roundMoney(couponTotal),
    manualTotal: roundMoney(manualTotal),
    byPayment: [...payments.values()].map((entry) => ({ ...entry, total: roundMoney(entry.total) })),
    byPoint: [...points.values()]
      .map((entry) => ({ ...entry, total: roundMoney(entry.total) }))
      .sort((a, b) => b.count - a.count || collator.compare(a.name, b.name)),
    avgPrep: averageMinutes(preps),
    avgRoad: averageMinutes(roads),
    avgTotal: averageMinutes(totals),
    deliveredCash: roundMoney(collected.cash[0]),
    deliveredCashCount: collected.cash[1],
    deliveredCard: roundMoney(collected.card[0]),
    deliveredCardCount: collected.card[1],
    deliveredTransfer: roundMoney(collected.bank_transfer[0]),
    deliveredTransferCount: collected.bank_transfer[1],
    deliveredToday,
    deliveredTodayTotal: roundMoney(deliveredTodayTotal),
    open,
    openPrep: open.filter((order) => order.status === "Hazırlanıyor").length,
    openRoad: open.filter((order) => order.status === "Yolda").length,
    openCash: roundMoney(openCash),
    openCashCount,
    todayOrders,
  };
};

// 76 mm termal rulo için ortak rapor stili (yalnızca düz siyah: termal yazıcı gri basmaz)
const REPORT_CSS = `
        <style>
          @page { size: 76mm 127mm; margin: 4mm 0; }
          html, body { width: 76mm; margin: 0; padding: 0; }
          body { font-family: Arial, sans-serif; color: #000; line-height: 1.25; padding: 0 5mm; box-sizing: border-box; }
          h1 { font-size: 15px; text-align: center; margin: 0; letter-spacing: 0.5px; word-break: break-word; }
          h2 { font-size: 11px; margin: 7px 0 3px; text-transform: uppercase; letter-spacing: 0.3px; }
          .meta { font-size: 10px; text-align: center; margin-top: 2px; }
          .rule { border-top: 1px dashed #000; margin: 5px 0; }
          .rule-solid { border-top: 2px solid #000; margin: 6px 0 5px; }
          .row { display: flex; justify-content: space-between; gap: 8px; font-size: 11px; margin: 2px 0; }
          .row > span:last-child { text-align: right; white-space: nowrap; }
          .row.strong { font-weight: bold; }
          .row.big { font-size: 15px; font-weight: bold; align-items: baseline; }
          .line { display: flex; justify-content: space-between; gap: 8px; font-size: 11px; margin: 7px 0 2px; }
          .line > span:last-child { flex: 1 1 auto; border-bottom: 1px solid #000; margin-left: 6px; }
          .stop { border: 1.5px solid #000; padding: 4px 5px; margin: 0 0 5px; page-break-inside: avoid; }
          .stop-head { display: flex; align-items: center; gap: 5px; font-size: 13px; font-weight: bold; }
          .stop-head .where { margin-left: auto; font-size: 10px; font-weight: bold; text-align: right; }
          .box { width: 10px; height: 10px; border: 1.5px solid #000; flex: 0 0 auto; }
          .name { font-size: 12px; font-weight: bold; margin-top: 2px; word-break: break-word; }
          .phone { font-size: 16px; font-weight: bold; letter-spacing: 0.3px; margin-top: 1px; }
          .pay { display: flex; justify-content: space-between; gap: 6px; font-size: 12px; font-weight: bold; margin-top: 3px; }
          .note { font-size: 10px; margin-top: 3px; padding-top: 2px; border-top: 1px dashed #000; word-break: break-word; }
          .open { display: flex; justify-content: space-between; gap: 6px; font-size: 10px; margin: 2px 0; }
          .open span:last-child { white-space: nowrap; }
          .totals { font-size: 12px; font-weight: bold; text-align: center; margin-top: 2px; }
          .small { font-size: 10px; text-align: center; margin-top: 2px; }
          * { page-break-inside: avoid; }
        </style>
      `;
const AUTO_PRINT_SCRIPT = "<script>window.onload=function(){window.print();setTimeout(function(){window.close()},500)}</script>";
const printStamp = (ms) => new Date(ms).toLocaleString("tr-TR", {
  timeZone: TR_TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
});
const formatMinutesShort = (minutes) => {
  if (minutes === null || minutes === undefined || !Number.isFinite(Number(minutes))) return "—";
  const value = Math.max(0, Math.round(Number(minutes)));
  if (value < 60) return `${value} dk`;
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  return rest ? `${hours} sa ${rest} dk` : `${hours} sa`;
};
const shortText = (value, max) => {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};
const signedMoney = (value) => {
  const n = roundMoney(value);
  if (n === 0) return formatMoney(0);
  return `${n > 0 ? "+" : "−"}${formatMoney(Math.abs(n))}`;
};
const STATUS_PRINT = { "Hazırlanıyor": "Hazırlanıyor", "Yolda": "Yolda", "Teslim Edildi": "Teslim edildi", "İptal Edildi": "İptal edildi" };

/**
 * Gün sonu (Z raporu benzeri) yazdırma belgesi. options.counted: kasada sayılan nakit (verilirse fark da basılır,
 * verilmezse elle doldurmak için boş satır bırakılır).
 */
export const buildDayCloseDocument = (summary, { autoPrint = true, counted = null } = {}) => {
  const esc = escapeHtml;
  const money = formatMoney;
  const s = summary || buildDayCloseSummary([]);
  const day = new Date(toTime(s.dayStart)).toLocaleDateString("tr-TR", {
    timeZone: TR_TZ, day: "2-digit", month: "2-digit", year: "numeric", weekday: "long",
  });
  const row = (label, value, cls = "") => `<div class="row ${cls}"><span>${esc(label)}</span><span>${esc(value)}</span></div>`;
  const paymentRows = (s.byPayment || [])
    .filter((entry) => entry.method !== "none" || entry.count > 0)
    .map((entry) => row(`${entry.label} (${entry.count})`, money(entry.total))).join("");
  const pointRows = (s.byPoint || []).map((entry) => row(`${entry.name} (${entry.count})`, money(entry.total))).join("");
  const countedValue = counted === null || counted === undefined || counted === "" ? null : Number(counted);
  const hasCounted = Number.isFinite(countedValue);
  const cashRows = [
    row(`Teslim edilen nakit (${s.deliveredCashCount || 0})`, money(s.deliveredCash), "strong"),
    row(`POS (${s.deliveredCardCount || 0})`, money(s.deliveredCard)),
    row(`Havale / EFT (${s.deliveredTransferCount || 0})`, money(s.deliveredTransfer)),
    s.openCashCount ? row(`Yoldaki nakit (${s.openCashCount})`, money(s.openCash)) : "",
    hasCounted
      ? row("Sayılan nakit", money(countedValue), "strong") + row("Fark", signedMoney(countedValue - (s.deliveredCash || 0)), "strong")
      : '<div class="line"><span>Sayılan nakit</span><span></span></div><div class="line"><span>Fark</span><span></span></div>',
  ].join("");
  const openList = s.open || [];
  const openHtml = openList.length ? `
            <h2>Açık siparişler (${openList.length})</h2>
            ${openList.map((order) => `<div class="open"><span>#${esc(shortOrderId(order.orderId))} ${esc(printableCustomer(order, "Müşteri"))}</span><span>${esc(STATUS_PRINT[order.status] || order.status || "")}</span></div>`).join("")}` : "";
  return `
        <html>
          <head><meta charset="utf-8"/><title>Gün sonu</title>${REPORT_CSS}</head>
          <body>
            <h1>GÜN SONU</h1>
            <div class="meta">${esc(day)}</div>
            <div class="meta">Hazırlanma: ${esc(printStamp(toTime(s.generatedAt)))}</div>
            <div class="rule-solid"></div>
            <h2>Bugün verilen siparişler</h2>
            ${row("Sipariş", String(s.count || 0))}
            ${row("Teslim edildi", String(s.delivered || 0))}
            ${s.pendingToday ? row("Bekleyen", String(s.pendingToday)) : ""}
            ${row(`İptal (${s.cancelled || 0})`, money(s.cancelledTotal))}
            <div class="rule"></div>
            ${row("CİRO", money(s.revenue), "big")}
            <div class="small">İptal edilen siparişler hariç</div>
            ${row("Ort. sepet", money(s.avgBasket))}
            ${row("Kupon indirimi", s.couponTotal ? `-${money(s.couponTotal)}` : money(0))}
            ${row("Elle eklenen tutar", money(s.manualTotal))}
            <h2>Ödeme yöntemi</h2>
            ${paymentRows}
            ${pointRows ? `<h2>Teslimat noktası</h2>${pointRows}` : ""}
            <h2>Süreler</h2>
            ${row("Ort. hazırlık", formatMinutesShort(s.avgPrep))}
            ${row("Ort. yol", formatMinutesShort(s.avgRoad))}
            ${row("Ort. toplam", formatMinutesShort(s.avgTotal))}
            <div class="rule-solid"></div>
            <h2>Kasa (bugün teslim edilenler)</h2>
            ${cashRows}
            ${openHtml}
            <div class="rule-solid"></div>
            <div class="line"><span>İmza</span><span></span></div>
            ${autoPrint ? AUTO_PRINT_SCRIPT : ""}
          </body>
        </html>
      `;
};

/** Gün sonu raporunu yazdırır; açılır pencere engellendiyse false */
export const printDayClose = (summary, options = {}) =>
  writePrintWindow(buildDayCloseDocument(summary, { ...options, autoPrint: true }));

const RUN_PAY_LINE = {
  cash: "NAKİT TAHSİL ET",
  card: "POS İLE TAHSİL ET",
  bank_transfer: "HAVALE (ödemeyi kontrol et)",
};

/**
 * Kurye fişi: yoldaki / bir yurdun siparişleri tek listede (verilen sırayla; çağıran en eskiyi önce verir).
 * Her sipariş bir kutu: işaret kutusu, #KOD, nokta, ad, büyük telefon, tahsilat + tutar, kısa not.
 */
export const buildRunSheetDocument = (orders, { title, autoPrint = true } = {}) => {
  const esc = escapeHtml;
  const money = formatMoney;
  const list = (Array.isArray(orders) ? orders : [orders]).filter(Boolean);
  const heading = title ? `KURYE FİŞİ · ${title}` : "KURYE FİŞİ";
  let cash = 0;
  let cardCount = 0;
  let transferCount = 0;
  let unknownCount = 0;
  let total = 0;
  const stops = list.map((order) => {
    const amount = Number(order.totalAmount) || 0;
    total += amount;
    const method = order.paymentMethod;
    if (method === "cash") cash += amount;
    else if (method === "card") cardCount += 1;
    else if (method === "bank_transfer") transferCount += 1;
    else unknownCount += 1;
    const phone = formatPhoneTR(order.phone || order.user?.phone || "") || "Telefon yok";
    const note = shortText(order.note, 90);
    const tracking = shortText(order.deliveryTracking, 60);
    return `
            <div class="stop">
              <div class="stop-head"><span class="box"></span><span>#${esc(shortOrderId(order.orderId))}</span><span class="where">${esc(orderPointName(order))}</span></div>
              <div class="name">${esc(printableCustomer(order, "Müşteri"))}</div>
              <div class="phone">${esc(phone)}</div>
              <div class="pay"><span>${esc(RUN_PAY_LINE[method] || "Ödeme belirtilmemiş")}</span><span>${esc(money(amount))}</span></div>
              ${note ? `<div class="note">NOT: ${esc(note)}</div>` : ""}
              ${tracking ? `<div class="note">${esc(tracking)}</div>` : ""}
            </div>`;
  }).join("");
  const summaryLine = [
    `Nakit tahsil ${money(cash)}`, `POS ${cardCount}`, `Havale ${transferCount}`,
    ...(unknownCount ? [`Belirtilmemiş ${unknownCount}`] : []),
  ].join(" · ");
  return `
        <html>
          <head><meta charset="utf-8"/><title>${esc(heading)}</title>${REPORT_CSS}</head>
          <body>
            <h1>${esc(heading)}</h1>
            <div class="meta">${esc(printStamp(Date.now()))} · ${list.length} sipariş</div>
            <div class="rule-solid"></div>
            ${stops}
            <div class="rule-solid"></div>
            <div class="totals">${esc(summaryLine)}</div>
            <div class="small">Toplam ${list.length} sipariş · ${esc(money(total))}</div>
            ${autoPrint ? AUTO_PRINT_SCRIPT : ""}
          </body>
        </html>
      `;
};

/** Kurye fişini yazdırır; açılır pencere engellendiyse false */
export const printRunSheet = (orders, { title } = {}) => writePrintWindow(buildRunSheetDocument(orders, { title }));
