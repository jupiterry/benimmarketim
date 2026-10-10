// Siparişler ekranının yardımcıları: fiş / toplama listesi yazdırma, Excel'e (CSV)
// aktarma, telefon biçimleme ve Türkçe uyumlu arama. Ağ isteği yapmaz, durum tutmaz.

// ── Metin ve sayı ─────────────────────────────────────────────────────────────

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
  const orderCount = Number(order.userOrderCount) || 0;
  const flagHtml = orderCount === 1
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
              <div class="row strong"><div>Müşteri</div><div>${esc(order.user?.name || "-")}</div></div>
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

// Siparişlerdeki ürünleri adına göre toplar: kaç adet, kaç siparişte, hangi siparişlerde.
// Ayrıca teslimat noktasına göre dağıtım özeti çıkarır.
export const buildPickingList = (orders) => {
  const items = new Map();
  const points = new Map();
  let unitCount = 0;

  for (const order of orders || []) {
    const shortId = shortOrderId(order.orderId);
    for (const product of order.products || []) {
      const name = String(product?.name || "Bilinmeyen ürün").trim();
      const key = normalizeSearch(name);
      const qty = Number(product?.quantity) || 0;
      unitCount += qty;
      if (!items.has(key)) items.set(key, { key, name, image: product?.image || null, quantity: 0, orders: [] });
      const item = items.get(key);
      item.quantity += qty;
      const existing = item.orders.find((entry) => entry.orderId === order.orderId);
      if (existing) existing.quantity += qty;
      else item.orders.push({ orderId: order.orderId, shortId, quantity: qty, customer: order.user?.name || "Müşteri" });
    }

    const pointName = order.deliveryPointName || order.city || "Belirtilmemiş";
    if (!points.has(pointName)) points.set(pointName, { name: pointName, orders: [], total: 0 });
    const point = points.get(pointName);
    point.orders.push({
      orderId: order.orderId,
      shortId,
      customer: order.user?.name || "Müşteri",
      phone: order.phone || order.user?.phone || "",
      total: Number(order.totalAmount) || 0,
      status: order.status,
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
  "Sipariş No", "Tarih", "Saat", "Müşteri", "Telefon", "E-posta", "Teslimat Noktası", "Durum",
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
    `${order.user?.name || "Müşteri"} · ${formatPhoneTR(order.phone || order.user?.phone || "") || "-"}`,
    ...(order.products || []).map((p) => `- ${p.quantity} x ${p.name}`),
    `Toplam: ${formatMoney(order.totalAmount)}`,
  ];
  if (order.note && String(order.note).trim()) lines.push(`Not: ${String(order.note).trim()}`);
  return lines.join("\n");
};

// Müşteriye WhatsApp'tan gönderilecek hazır mesaj (duruma göre)
export const buildWhatsAppMessage = (order) => {
  const firstName = String(order.user?.name || "").trim().split(/\s+/)[0] || "";
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
