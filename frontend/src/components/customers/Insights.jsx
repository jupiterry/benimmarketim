// Liste üstündeki içgörü panelleri: yeni kayıt grafiği, en iyi müşteriler, mobil uygulama takibi.
import { useMemo, useState } from "react";
import { Crown, Smartphone, UserPlus } from "lucide-react";
import { EmptyState, Segmented, Skeleton, formatDate, formatDateTime, money } from "../admin/ui";
import { registrationSeries, relativeTime } from "../../lib/customers";
import { APP_FILTERS, APP_PERIODS, Avatar, registeredAt } from "./shared";

/** Günlük yeni kayıt çubukları + son kayıt olanlar */
export const RegistrationsPanel = ({ customers, now, onOpen }) => {
  const [days, setDays] = useState(14);
  const series = useMemo(() => registrationSeries(customers, days, now), [customers, days, now]);
  const total = series.reduce((sum, day) => sum + day.count, 0);
  const max = Math.max(1, ...series.map((day) => day.count));
  const latest = useMemo(
    () => customers.filter((u) => registeredAt(u)).sort((a, b) => registeredAt(b) - registeredAt(a)).slice(0, 5),
    [customers],
  );
  const labelEvery = days > 14 ? 5 : 2;
  return (
    <section className="ui-panel cus-panel">
      <div className="ui-panel-head">
        <div className="cus-panel-title">
          <UserPlus aria-hidden="true" />
          <div>
            <h3>Yeni kayıtlar</h3>
            <p>Son {days} günde <strong className="ui-num">{total}</strong> kişi</p>
          </div>
        </div>
        <Segmented size="sm" ariaLabel="Grafik dönemi" value={days} onChange={setDays} options={[{ value: 14, label: "14 gün" }, { value: 30, label: "30 gün" }]} />
      </div>
      <div className="ui-panel-body cus-panel-body">
        <div className="cus-chart" role="img" aria-label={`Son ${days} günün günlük kayıt sayıları, toplam ${total}`}>
          {series.map((day, index) => {
            const isToday = index === series.length - 1;
            const showLabel = isToday || (series.length - 1 - index) % labelEvery === 0;
            return (
              <div key={day.start} className="cus-chart-col" title={`${formatDate(day.start)}: ${day.count} kayıt`}>
                <span className="cus-chart-value ui-num">{day.count || ""}</span>
                <span className="cus-chart-track"><i style={{ height: `${(day.count / max) * 100}%` }} data-today={isToday || undefined} /></span>
                <span className="cus-chart-label">{showLabel ? (isToday ? "Bugün" : formatDate(day.start)) : ""}</span>
              </div>
            );
          })}
        </div>
        <div className="cus-latest">
          <p className="cus-latest-title">Son kayıt olanlar</p>
          {latest.length === 0 && <p className="ui-muted ui-text-sm">Henüz kayıt yok</p>}
          {latest.map((user) => (
            <button key={user._id} type="button" className="cus-latest-row" onClick={() => onOpen(user)} title="Profili aç">
              <Avatar name={user.name} src={user.avatar} />
              <span className="cus-latest-text">
                <span className="ui-truncate">{user.name || "İsimsiz"}</span>
                <span className="cus-when-sub ui-truncate">{user.phone || user.email}</span>
              </span>
              <span className="cus-when-sub" title={formatDateTime(registeredAt(user))}>{relativeTime(registeredAt(user), now)}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
};

/** Harcamaya göre en iyi müşteriler (GET /users/best-customers) */
export const BestCustomersPanel = ({ best, loading, usersById, onOpen }) => (
  <section className="ui-panel cus-panel">
    <div className="ui-panel-head">
      <div className="cus-panel-title">
        <Crown aria-hidden="true" />
        <div>
          <h3>En iyi müşteriler</h3>
          <p>Toplam harcamaya göre · iptaller hariç</p>
        </div>
      </div>
    </div>
    <div className="ui-panel-body">
      {loading ? (
        <div className="ui-stack ui-stack--sm">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} height={34} radius={8} />)}</div>
      ) : best.length === 0 ? (
        <EmptyState icon={Crown} title="Henüz sipariş yok" compact />
      ) : (
        <ol className="cus-best">
          {best.slice(0, 6).map((c, i) => {
            const user = usersById.get(String(c.userId));
            return (
              <li key={c.userId}>
                <span className="ui-rank">{i + 1}</span>
                <button type="button" className="cus-latest-row cus-best-row" onClick={() => user && onOpen(user)} disabled={!user} title={user ? "Profili aç" : "Hesap silinmiş"}>
                  <span className="cus-latest-text">
                    <span className="ui-truncate">{c.name || user?.name || "Silinmiş hesap"}</span>
                    <span className="cus-when-sub ui-num">{c.orderCount} sipariş · ort. {money(c.avgOrderValue)}</span>
                  </span>
                  <span className="cus-best-amount ui-num">{money(c.totalSpent)}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  </section>
);

/** Mobil uygulama hunisi: dönem + kutular; kutuya tıklayınca liste süzülür */
export const AppTrackingPanel = ({ customers, now, appSince, period, onPeriod, filter, onFilter }) => {
  const tiles = useMemo(
    () => APP_FILTERS.map((f) => ({ ...f, value: customers.filter((u) => f.test(u, appSince, now)).length })),
    [customers, appSince, now],
  );
  return (
    <section className="ui-panel cus-panel">
      <div className="ui-panel-head">
        <div className="cus-panel-title">
          <Smartphone aria-hidden="true" />
          <div>
            <h3>Uygulama takibi</h3>
            <p>Uygulamayı açanlar ve siparişe kadar geldikleri adım</p>
          </div>
        </div>
        <Segmented size="sm" ariaLabel="Uygulama takibi dönemi" value={period} onChange={onPeriod} options={APP_PERIODS} />
      </div>
      <div className="ui-panel-body cus-app">
        {tiles.map((tile) => (
          <button key={tile.id} type="button" className="cus-app-tile" aria-pressed={filter === tile.id} onClick={() => onFilter(filter === tile.id ? null : tile.id)} title="Listede göster">
            <span className="cus-app-label">{tile.tone && <span className={`ui-dot ui-dot--${tile.tone}`} />}{tile.label}</span>
            <span className="cus-app-value ui-num">{tile.value}</span>
          </button>
        ))}
      </div>
    </section>
  );
};
