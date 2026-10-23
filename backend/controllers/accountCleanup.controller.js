// Pasif hesap temizliği (yönetici paneli → Müşteriler → Hesap temizliği)
// Tüm uç noktalar protectRoute + adminRoute arkasındadır (routes/accountCleanup.route.js).
// Sayılar sunucuda, tüm müşteri koleksiyonu üzerinden kesin hesaplanır (services/accountCleanup.service.js).
import {
  deleteCleanupCandidates,
  exportCleanupCsv,
  getCleanupIds,
  getCleanupSummary,
  listCleanupUsers,
  parseDeleteBody,
  parseListQuery,
  parseMonths,
} from "../services/accountCleanup.service.js";
import { recordAdminAction } from "../services/adminAudit.service.js";

const SEGMENT_LABELS = { inactive: "ay pasif", never: "Etkinlik kaydı yok" };
const segmentLabel = (segment, months) => (segment === "inactive" ? `${months}+ ${SEGMENT_LABELS.inactive}` : SEGMENT_LABELS.never);
const SKIP_LABELS = {
  not_found: "Bulunamadı",
  admin: "Yönetici",
  self: "Kendi hesabı",
  not_in_segment: "Artık listede değil",
  active_order: "Aktif sipariş",
  too_new: "Hesap yeni",
  error: "Hata",
};

const noStore = (res) => {
  if (typeof res.set === "function") res.set("Cache-Control", "no-store");
  else if (typeof res.setHeader === "function") res.setHeader("Cache-Control", "no-store");
};
const badRequest = (res, error, field) => res.status(400).json({ success: false, message: error, field });

// GET /api/account-cleanup/summary?months=10
export const getSummary = async (req, res) => {
  const months = parseMonths(req.query?.months);
  if (months.error) return badRequest(res, months.error, "months");
  try {
    const summary = await getCleanupSummary({ months: months.value });
    noStore(res);
    return res.json(summary);
  } catch (error) {
    console.error("Pasif hesap özeti hazırlanamadı:", error);
    return res.status(500).json({ success: false, message: "Pasif hesap özeti hazırlanamadı" });
  }
};

// GET /api/account-cleanup/users?segment&months&q&orders&source&sort&dir&page&limit
export const getUsers = async (req, res) => {
  const parsed = parseListQuery(req.query || {});
  if (parsed.error) return badRequest(res, parsed.error, parsed.field);
  try {
    const result = await listCleanupUsers(parsed.value);
    noStore(res);
    return res.json(result);
  } catch (error) {
    console.error("Pasif hesap listesi hazırlanamadı:", error);
    return res.status(500).json({ success: false, message: "Pasif hesap listesi hazırlanamadı" });
  }
};

// GET /api/account-cleanup/ids?segment&months&q&orders&source → eşleşen tüm silinebilir hesapların kimlikleri
export const getIds = async (req, res) => {
  const parsed = parseListQuery(req.query || {}, { paging: false, sorting: false });
  if (parsed.error) return badRequest(res, parsed.error, parsed.field);
  try {
    const result = await getCleanupIds(parsed.value);
    noStore(res);
    return res.json(result);
  } catch (error) {
    console.error("Pasif hesap kimlikleri hazırlanamadı:", error);
    return res.status(500).json({ success: false, message: "Hesap listesi hazırlanamadı" });
  }
};

// GET /api/account-cleanup/export?segment&months&q&orders&source&sort&dir → CSV (UTF-8 BOM, ';')
export const exportCsv = async (req, res) => {
  const parsed = parseListQuery(req.query || {}, { paging: false });
  if (parsed.error) return badRequest(res, parsed.error, parsed.field);
  try {
    const { csv } = await exportCleanupCsv(parsed.value);
    const day = new Date().toISOString().slice(0, 10);
    const name = parsed.value.segment === "never" ? "etkinlik-kaydi-yok" : `${parsed.value.months}-ay-pasif`;
    noStore(res);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="pasif-hesaplar-${name}-${day}.csv"`);
    return res.status(200).send(csv);
  } catch (error) {
    console.error("Pasif hesap CSV hazırlanamadı:", error);
    return res.status(500).json({ success: false, message: "CSV hazırlanamadı" });
  }
};

/** İşlem kaydındaki kısa ad listesi: "Ayşe Yılmaz, Mehmet Kaya ve 48 hesap daha" */
export const summarizeNames = (names, shown = 3) => {
  if (!names.length) return "";
  const head = names.slice(0, shown).join(", ");
  return names.length > shown ? `${head} ve ${names.length - shown} hesap daha` : head;
};

// POST /api/account-cleanup/delete { userIds: string[1..100], segment, months }
export const deleteUsers = async (req, res) => {
  // Bu uç noktanın kaydını yalnızca denetleyici yazar (genel yakalayıcı "/api" altında yanlış bölüm adı yazmasın)
  req.auditRecorded = true;
  const parsed = parseDeleteBody(req.body);
  if (parsed.error) return badRequest(res, parsed.error, parsed.field);
  const { ids, segment, months } = parsed.value;
  try {
    const { deleted, skipped, ordersPreserved, deletedNames } = await deleteCleanupCandidates({
      ids, segment, months, actorId: req.user?._id,
    });
    if (deleted.length) {
      const reasons = skipped.reduce((acc, { reason }) => ({ ...acc, [reason]: (acc[reason] || 0) + 1 }), {});
      recordAdminAction(req, {
        action: "Pasif hesap silme",
        category: "customer",
        target: `${deleted.length} hesap`,
        targetName: summarizeNames(deletedNames),
        changes: [
          { label: "Silinen hesap", from: "", to: String(deleted.length) },
          { label: "Atlanan", from: "", to: skipped.length ? `${skipped.length} (${Object.entries(reasons).map(([reason, count]) => `${SKIP_LABELS[reason] || reason}: ${count}`).join(", ")})` : "0" },
          { label: "Korunan sipariş", from: "", to: String(ordersPreserved) },
          { label: "Liste", from: "", to: segmentLabel(segment, months) },
          { label: "Süre", from: "", to: `${months} ay` },
        ],
        meta: { segment, months, deleted: deleted.length, skipped: skipped.length, ordersPreserved, deletedIds: deleted, skippedReasons: reasons },
      });
    }
    return res.json({ deleted, skipped, ordersPreserved });
  } catch (error) {
    console.error("Pasif hesaplar silinemedi:", error);
    return res.status(500).json({ success: false, message: "Hesaplar silinemedi" });
  }
};
