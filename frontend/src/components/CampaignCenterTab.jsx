// Kampanya merkezi: yayındaki ve planlı tüm kampanyalar tek ekranda, satış ve indirim getirisiyle.
// İskelet; içerik kampanya merkezi paketiyle doldurulur (GET /api/campaigns/...).
import { Megaphone } from "lucide-react";
import { EmptyState, PageHeader } from "./admin/ui";

const CampaignCenterTab = () => (
  <div className="ui-page">
    <PageHeader title="Kampanya merkezi" description="Yayındaki ve planlı kampanyalar, satış ve indirim getirisiyle." />
    <section className="ui-panel">
      <EmptyState icon={Megaphone} title="Hazırlanıyor" description="Bu ekran yakında dolacak." />
    </section>
  </div>
);

export default CampaignCenterTab;
