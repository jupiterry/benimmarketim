// Siparişler ekranının ilerletme akışı (JSX yok): tek siparişi ve grupları yola çıkarma / teslim etme.
//  (a) İlk sipariş teyidi: teyit bekleyen sipariş Hazırlanıyor'dan ileri giderken "İlk sipariş henüz teyit edilmedi"
//      sorulur: [Arandım, teyit et ve yola çıkar] [Yine de yola çıkar] [Vazgeç]. Toplu / grup eylemleri bu siparişleri
//      atlar ve "2 sipariş teyit beklediği için yola çıkarılmadı · Göster" der.
//  (c) Aynı müşterinin başka hazırlanan siparişi varsa: "Ayşe’nin #CD34EF siparişi de hazırlanıyor"
//      [Birlikte yola çıkar] [Yalnız bunu].
//  (d) Kuryeyle yola çıkarma: kuryesi olmayan sipariş tek aktif kuryeye kendiliğinden, birden çok kuryede son
//      kullanılana (ya da seçilene) atanır; grup / toplu yola çıkarmada kurye bir kez sorulur.
// Durum değişikliğinin kendisi (5 sn geri alma, kuyruk, sunucu) useOrdersData'dadır; burada yalnızca sorular sorulur ve
// sipariş başına force / kurye bilgisi (meta) hazırlanır. Sorular sırasında sipariş başka yerde değişmişse yalnızca hâlâ
// aynı durumda olanlar taşınır.
import { createElement, useMemo, useRef } from "react";
import toast from "react-hot-toast";
import { Bike, Check, Layers, Truck, UserMinus } from "lucide-react";
import { usePref } from "../admin/ui";
import { formatPhoneTR } from "../../lib/orderTools";
import { NoticeToast } from "./atoms";
import {
  callbackBlocks, combinedAmountLabel, customerName, customerPhone, customerPossessive, nextAction, orderCode, telHref,
} from "./shared";

const PREP = "Hazırlanıyor";
const ROAD = "Yolda";
const DONE = "Teslim Edildi";
const CANCELLED = Symbol("cancelled");
export const LAST_COURIER_KEY = "admin-order-last-courier";

const uniqueOrders = (orders) => {
  const seen = new Set();
  const out = [];
  for (const order of Array.isArray(orders) ? orders : [orders]) {
    const id = order?.orderId;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(order);
  }
  return out;
};

// ── Soru metinleri ─────────────────────────────────────────────────────────
const siblingSpec = (order, siblings) => {
  const owner = customerPossessive(order);
  const one = siblings.length === 1;
  return {
    title: one ? `${owner} ${orderCode(siblings[0])} siparişi de hazırlanıyor` : `${owner} ${siblings.length} siparişi daha hazırlanıyor`,
    message: one
      ? "İkisini aynı kuryeyle birlikte gönderebilirsiniz; kapıda tek seferde tahsil edilir."
      : `${siblings.map((o) => orderCode(o)).join(", ")} · hepsini aynı kuryeyle birlikte gönderebilirsiniz.`,
    tone: "info",
    options: [
      {
        id: "together", label: "Birlikte yola çıkar", description: combinedAmountLabel([order, ...siblings]), icon: Layers,
        variant: "primary", autoFocus: true,
      },
      { id: "single", label: "Yalnız bunu", description: `Yalnızca ${orderCode(order)} yola çıkar`, icon: Truck },
    ],
  };
};

const callbackSpec = (blocked, to) => {
  const [first] = blocked;
  const verb = to === DONE ? "teslim et" : "yola çıkar";
  const phone = formatPhoneTR(customerPhone(first)) || customerPhone(first);
  const tel = telHref(first);
  return {
    title: "İlk sipariş henüz teyit edilmedi",
    message: blocked.length === 1
      ? `${customerName(first)} adlı müşterinin ${orderCode(first)} siparişi telefonla teyit edilmedi. Müşteriyi arayıp adresi ve siparişi teyit edin.`
      : `${blocked.map((o) => orderCode(o)).join(", ")} siparişleri telefonla teyit edilmedi. Aynı müşteri; tek arama yeter.`,
    tone: "call",
    link: tel ? { href: tel, label: `Ara · ${phone}` } : null,
    options: [
      { id: "confirm", label: `Arandım, teyit et ve ${verb}`, icon: Check, variant: "primary", autoFocus: true },
      { id: "force", label: `Yine de ${verb}`, description: "İşlem kaydına “teyitsiz yola çıkarıldı” yazılır", variant: "warn" },
    ],
  };
};

const courierSpec = (needCount, totalCount, active, lastId) => {
  const ordered = [...active].sort((a, b) => Number(b._id === lastId) - Number(a._id === lastId));
  const single = totalCount === 1;
  return {
    title: single ? "Hangi kuryeyle yola çıksın?" : `${totalCount} siparişi yola çıkar`,
    message: needCount === totalCount
      ? (single ? "Sipariş seçtiğiniz kuryeye atanır ve yola çıkar." : `${needCount} sipariş seçtiğiniz kuryeye atanır ve yola çıkar.`)
      : `Kuryesi olmayan ${needCount} sipariş seçtiğiniz kuryeye atanır; diğerleri kendi kuryesiyle yola çıkar.`,
    tone: "courier",
    options: [
      ...ordered.map((courier, index) => ({
        id: courier._id,
        label: `${courier.name} ile yola çıkar`,
        description: courier._id === lastId ? "Son kullanılan kurye" : (courier.phone ? formatPhoneTR(courier.phone) : undefined),
        icon: Bike,
        variant: index === 0 ? "primary" : "default",
        autoFocus: index === 0,
      })),
      { id: "none", label: "Kuryesiz yola çıkar", icon: UserMinus },
    ],
  };
};

/**
 * data: useOrdersData sonucu · couriers: useCouriers sonucu · ask: useChoiceDialog().ask
 * onSeen(ids): ilerletilen / teyit edilen siparişler görüldü sayılır (admin-order-seen olayı)
 * onShowCallbacks(ids): "Göster" — atlanan teyit bekleyen siparişleri göster
 * siblingsOf(orderId): aynı müşterinin diğer aktif siparişleri
 */
export default function useAdvanceFlow({ data, couriers, ask, onSeen, onShowCallbacks, siblingsOf }) {
  const [lastPref, setLastPref] = usePref(LAST_COURIER_KEY, null);
  const lastCourierId = typeof lastPref === "string" && /^[0-9a-f]{24}$/i.test(lastPref) ? lastPref : null;
  const ref = useRef(null);
  ref.current = { data, couriers, ask, onSeen, onShowCallbacks, siblingsOf, lastCourierId, setLastPref };

  const flow = useMemo(() => {
    const latest = (id) => ref.current.data.ordersById.get(id) || null;
    const activeCouriers = () => (ref.current.couriers?.status === "ready" ? ref.current.couriers.active || [] : []);
    const lastCourier = () => activeCouriers().find((c) => c._id === ref.current.lastCourierId) || null;
    const rememberCourier = (courier) => {
      if (courier?._id && courier._id !== ref.current.lastCourierId) ref.current.setLastPref(courier._id);
    };
    const seen = (orders) => ref.current.onSeen?.(orders.map((o) => o.orderId));
    /** Aynı müşterinin hâlâ hazırlanan (bekleyen değişikliği olmayan) diğer siparişleri */
    const prepSiblings = (order) => (ref.current.siblingsOf?.(order.orderId) || [])
      .map((o) => latest(o.orderId))
      .filter((o) => o && o.orderId !== order.orderId && o.status === PREP && !o.pending);

    /**
     * Kurye planı: null (kurye işlemi yok) · CANCELLED · { courier (null = kuryesiz), ids, asked }
     * preset: bölünmüş düğmeden seçilen kurye (null = kuryesiz); single: tek eylem (son kullanılan kurye sorulmadan)
     */
    const planCourier = async (orders, { preset, single }) => {
      const needs = orders.filter((o) => o.status === PREP && !o.courier?.id);
      const active = activeCouriers();
      if (!needs.length || !active.length) return null;
      const ids = needs.map((o) => o.orderId);
      if (preset === null) return { courier: null, ids, asked: true };
      if (preset && active.some((c) => c._id === preset._id)) return { courier: preset, ids, asked: true };
      if (active.length === 1) return { courier: active[0], ids, asked: false };
      if (single) {
        const last = lastCourier();
        if (last) return { courier: last, ids, asked: false };
      }
      const choice = await ref.current.ask(courierSpec(needs.length, orders.length, active, ref.current.lastCourierId));
      if (!choice) return CANCELLED;
      if (choice === "none") return { courier: null, ids, asked: true };
      const chosen = activeCouriers().find((c) => c._id === choice);
      return chosen ? { courier: chosen, ids, asked: true } : CANCELLED;
    };
    const metaFor = (orders, plan, force = new Set(), to = ROAD) => {
      const meta = new Map();
      for (const o of orders) {
        const entry = {};
        if (force.has(o.orderId) && callbackBlocks(o, to)) entry.force = true;
        if (plan?.ids.includes(o.orderId)) {
          entry.courierSet = true;
          if (plan.courier) entry.courier = plan.courier;
        }
        meta.set(o.orderId, entry);
      }
      return meta;
    };

    /** "2 sipariş teyit beklediği için yola çıkarılmadı · Göster" */
    const notifySkipped = (blocked, to) => {
      const verb = to === DONE ? "teslim edilmedi" : "yola çıkarılmadı";
      const message = blocked.length === 1
        ? `${orderCode(blocked[0])} teyit beklediği için ${verb}`
        : `${blocked.length} sipariş teyit beklediği için ${verb}`;
      const ids = blocked.map((o) => o.orderId);
      toast((t) => createElement(NoticeToast, {
        message,
        actionLabel: "Göster",
        onAction: () => {
          toast.dismiss(t.id);
          ref.current.onShowCallbacks?.(ids);
        },
      }), { id: "so-callback-skipped", duration: 8000 });
    };

    /** Tek sipariş (kart düğmesi, "e", Pano'da taşıma, çekmece menüsü). opts.courier: bölünmüş düğmeden seçilen kurye */
    const runSingle = async (order, to, { courier: preset, source = "card" } = {}) => {
      const { data: d } = ref.current;
      const start = latest(order?.orderId) || order;
      if (!start?.orderId) return false;
      const leavingPrep = start.status === PREP && !start.pending && (to === ROAD || to === DONE);
      if (!leavingPrep) {
        const ok = await d.changeStatus(start, to, { source });
        if (ok) seen([start]);
        return ok;
      }
      let set = [start];
      if (to === ROAD) {
        const siblings = prepSiblings(start);
        if (siblings.length) {
          const choice = await ref.current.ask(siblingSpec(start, siblings));
          if (!choice) return false;
          if (choice === "together") set = [start, ...siblings];
        }
      }
      const force = new Set();
      const blocked = set.map((o) => latest(o.orderId) || o).filter((o) => callbackBlocks(o, to));
      if (blocked.length) {
        const choice = await ref.current.ask(callbackSpec(blocked, to));
        if (!choice) return false;
        if (choice === "confirm") {
          const results = await Promise.all(blocked.map((o) => ref.current.data.confirmCallback(o)));
          if (results.some((ok) => !ok)) return false; // hata bildirimi veri katmanında
        } else {
          blocked.forEach((o) => force.add(o.orderId));
        }
      }
      let plan = null;
      if (to === ROAD) {
        plan = await planCourier(set.map((o) => latest(o.orderId) || o), { preset, single: true });
        if (plan === CANCELLED) return false;
      }
      // Sorular sırasında başka yerde değişen sipariş taşınmaz
      const fresh = set.map((o) => latest(o.orderId)).filter((o) => o && o.status === PREP && !o.pending);
      if (!fresh.some((o) => o.orderId === start.orderId)) {
        toast.error(`${orderCode(start)} bu arada değişti; değişiklik uygulanmadı`);
        return false;
      }
      const ok = await ref.current.data.changeStatus(fresh, to, { source, meta: metaFor(fresh, plan, force, to), bulkConfirmed: true });
      if (!ok) return false;
      if (plan?.courier && plan.asked) rememberCourier(plan.courier);
      seen(fresh);
      return true;
    };

    /**
     * Grup / toplu: hepsi aynı hedefe. Teyit bekleyenler atlanır (bildirimle); yola çıkarmada kuryesi olmayanlar için
     * kurye bir kez sorulur (tek aktif kuryede sorulmadan atanır).
     */
    const runMany = async (orders, to, { source = "bulk" } = {}) => {
      const start = uniqueOrders(orders).map((o) => latest(o.orderId) || o).filter((o) => o.status !== to);
      if (!start.length) return false;
      const blocked = start.filter((o) => !o.pending && callbackBlocks(o, to));
      const rest = start.filter((o) => !blocked.includes(o));
      if (blocked.length) notifySkipped(blocked, to);
      if (!rest.length) return false;
      let plan = null;
      if (to === ROAD) {
        plan = await planCourier(rest.filter((o) => !o.pending), { single: false });
        if (plan === CANCELLED) return false;
      }
      const expected = new Map(rest.map((o) => [o.orderId, o.status]));
      const fresh = rest.map((o) => latest(o.orderId))
        .filter((o) => o && o.status === expected.get(o.orderId) && !callbackBlocks(o, to));
      if (!fresh.length) return false;
      const ok = await ref.current.data.changeStatus(fresh, to, { source, meta: metaFor(fresh, plan), bulkConfirmed: Boolean(plan?.asked) });
      if (!ok) return false;
      if (plan?.courier && plan.asked) rememberCourier(plan.courier);
      seen(fresh);
      return true;
    };

    return {
      /** Sonraki adım (Yola çıkar / Teslim et); opts.courier: kurye nesnesi ya da null (kuryesiz) */
      advance: (order, opts = {}) => {
        const current = latest(order?.orderId) || order;
        const next = nextAction(current?.status);
        return next ? runSingle(current, next.status, { courier: opts?.courier, source: "card" }) : Promise.resolve(false);
      },
      /** Pano'da taşıma ve "Taşı" / "Diğer" menüleri: belirli bir duruma */
      move: (order, to) => runSingle(order, to, { source: "move" }),
      /** Grup düğmeleri ("Hepsini yola çıkar", "Hazır olanları yola çıkar"): her siparişin sonraki adımı */
      advanceMany: async (orders) => {
        const groups = new Map();
        for (const order of uniqueOrders(orders)) {
          const current = latest(order.orderId) || order;
          const next = nextAction(current.status);
          if (!next) continue;
          if (!groups.has(next.status)) groups.set(next.status, []);
          groups.get(next.status).push(current);
        }
        let applied = false;
        for (const [to, list] of groups) {
          if (await runMany(list, to, { source: "bulk" })) applied = true;
        }
        return applied;
      },
      /** Toplu çubuk: seçililerin hepsi verilen duruma */
      setStatusMany: (orders, to) => runMany(orders, to, { source: "bulk" }),
      /** Pano bırakma duyurusu için: bu taşıma bir soru açacak mı */
      needsPrompt: (order, to) => {
        const current = latest(order?.orderId) || order;
        if (!current || current.status !== PREP || current.pending || !(to === ROAD || to === DONE)) return false;
        if (callbackBlocks(current, to)) return true;
        if (to !== ROAD) return false;
        if (prepSiblings(current).length) return true;
        return !current.courier?.id && activeCouriers().length > 1 && !lastCourier();
      },
      rememberCourier,
    };
  }, []);

  return { ...flow, lastCourierId };
}
