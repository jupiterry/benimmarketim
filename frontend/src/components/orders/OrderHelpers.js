// Order helper functions

export const getOrderDuration = (createdAt, updatedAt, status) => {
    const start = new Date(createdAt);
    const end = status === "Teslim Edildi" || status === "İptal Edildi"
        ? new Date(updatedAt)
        : new Date();
    const diffMs = end - start;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `${diffMins}dk`;
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    return mins > 0 ? `${hours}s ${mins}dk` : `${hours}s`;
};

export const getWarningLevel = (createdAt, status) => {
    if (status !== "Hazırlanıyor") return null;
    const diffMins = Math.floor((new Date() - new Date(createdAt)) / 60000);
    if (diffMins >= 30) return "critical";
    if (diffMins >= 15) return "warning";
    return null;
};

export const getWaitingMinutes = (createdAt) => {
    return Math.floor((new Date() - new Date(createdAt)) / 60000);
};

export const statusConfig = {
    "Hazırlanıyor": {
        color: "bg-amber-500/20 text-amber-300 border-amber-400/40 shadow-[0_0_12px_rgba(245,158,11,0.25)]",
        dot: "bg-amber-400",
        icon: "⏳",
        pulse: true,
        glowClass: "animate-pulse",
    },
    "Yolda": {
        color: "bg-sky-50 text-sky-700 border-sky-200",
        dot: "bg-sky-400",
        icon: "🚚",
        pulse: false,
    },
    "Teslim Edildi": {
        color: "bg-emerald-50 text-emerald-700 border-emerald-200",
        dot: "bg-emerald-400",
        icon: "✓",
        pulse: false,
    },
    "İptal Edildi": {
        color: "bg-rose-50 text-rose-700 border-rose-200",
        dot: "bg-rose-400",
        icon: "✕",
        pulse: false,
    },
};

export const filterOrders = (orders, { searchTerm, statusFilter, dateFilter, deliveryPointFilter, minAmount, maxAmount }) => {
    return orders.filter((order) => {
        const matchesSearch =
            (order.orderId || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            order.products?.some(p => (p.name || '').toLowerCase().includes(searchTerm.toLowerCase())) ||
            (order.user?.name || '').toLowerCase().includes(searchTerm.toLowerCase());

        const matchesStatus = statusFilter === "all" || order.status === statusFilter;

        const matchesDeliveryPoint =
            deliveryPointFilter === "all" ||
            order.deliveryPoint === deliveryPointFilter ||
            order.deliveryPointName?.toLowerCase().includes(deliveryPointFilter.toLowerCase());

        const matchesAmount =
            (!minAmount || order.totalAmount >= parseFloat(minAmount)) &&
            (!maxAmount || order.totalAmount <= parseFloat(maxAmount));

        const orderDate = new Date(order.createdAt);
        const today = new Date();
        const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
        const lastWeek = new Date(today); lastWeek.setDate(lastWeek.getDate() - 7);
        const lastMonth = new Date(today); lastMonth.setMonth(lastMonth.getMonth() - 1);

        let matchesDate = true;
        if (dateFilter === "today") matchesDate = orderDate.toDateString() === today.toDateString();
        else if (dateFilter === "yesterday") matchesDate = orderDate.toDateString() === yesterday.toDateString();
        else if (dateFilter === "lastWeek") matchesDate = orderDate >= lastWeek;
        else if (dateFilter === "lastMonth") matchesDate = orderDate >= lastMonth;

        return matchesSearch && matchesStatus && matchesDate && matchesDeliveryPoint && matchesAmount;
    });
};

export const handlePrint = (order) => {
    try {
        const printWindow = window.open('', '_blank', 'width=400,height=700');
        if (!printWindow) return;

        const css = `<style>
      @page { size: 76mm 127mm; margin: 0; }
      html, body { width: 76mm; height: 127mm; margin: 0; padding: 0; }
      body { font-family: Arial, sans-serif; color: #000; line-height: 1.25; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .receipt { width: 76mm; height: 127mm; box-sizing: border-box; padding: 6mm; overflow: hidden; }
      .header { text-align: center; margin-bottom: 6px; }
      .title { font-size: 14px; font-weight: bold; }
      .meta { font-size: 11px; }
      .row { display: flex; justify-content: space-between; font-size: 11px; margin: 3px 0; gap: 6px; }
      .items { border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 4px 0; margin: 4px 0; }
      .item { display: grid; grid-template-columns: 1fr auto; column-gap: 8px; font-size: 11px; align-items: start; }
      .item .name { max-width: 60%; word-break: break-word; }
      .item .price { min-width: 48px; text-align: right; font-weight: bold; }
      .totals { font-size: 12px; font-weight: bold; }
      * { page-break-inside: avoid; }
    </style>`;

        const createdAt = new Date(order.createdAt).toLocaleString('tr-TR');
        const itemsHtml = order.products.map(p => `
      <div class="item">
        <div class="name">${p.name} x ${p.quantity}</div>
        <div class="price">₺${Number(p.price || 0).toFixed(2)}</div>
      </div>
    `).join('');

        const noteHtml = order.note ? `<div class="row"><div>Not:</div><div>${order.note}</div></div>` : '';
        const deliveryInfo = order.deliveryPointName || order.city || 'Teslimat Noktası Belirtilmemiş';

        const html = `<html><head><meta charset="utf-8"/>${css}</head><body>
      <div class="receipt">
        <div class="header">
          <div class="title">Benim Marketim</div>
          <div class="meta">Sipariş ID: ${order.orderId}</div>
          <div class="meta">Tarih: ${createdAt}</div>
          <div class="meta">📍 ${deliveryInfo}</div>
        </div>
        <div class="row"><div>Müşteri</div><div>${order.user.name}</div></div>
        <div class="row"><div>Telefon</div><div>${order.user.phone || '-'}</div></div>
        <div class="row"><div>Adres</div><div style="max-width: 170px; text-align:right;">${order.user.address || '-'}</div></div>
        <div class="items">${itemsHtml}</div>
        ${order.couponCode ? `
          <div class="row"><div>Ara Toplam</div><div>₺${(order.subtotalAmount || order.totalAmount).toFixed(2)}</div></div>
          <div class="row" style="color: #9333ea;"><div>🎟️ Kupon (${order.couponCode})</div><div>-₺${(order.couponDiscount || 0).toFixed(2)}</div></div>
        ` : ''}
        <div class="totals row"><div>Toplam</div><div>₺${(order.totalAmount).toFixed(2)}</div></div>
        ${noteHtml}
        <div style="margin-top: 10px; padding-top: 8px; border-top: 1px dashed #000; text-align: center;">
          <div style="font-size: 11px; font-weight: bold;">Bizi tercih ettiğiniz için teşekkür ederiz! ❤️</div>
          <div style="font-size: 10px; margin-top: 4px; color: #666;">📲 Uygulamayı güncellemeyi unutmayın!</div>
        </div>
      </div>
      <script>window.onload=function(){try{const e=document.querySelector('.receipt');const m=e.clientHeight;const a=e.scrollHeight;if(a>m){const s=m/a;e.style.transformOrigin='top left';e.style.transform='scale('+s.toFixed(3)+')';e.style.height=m+'px';}}catch(e){}window.print();setTimeout(()=>window.close(),500);}<\/script>
    </body></html>`;

        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
    } catch (e) {
        console.error('Yazdırma hatası:', e);
    }
};
