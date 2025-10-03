import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Flame, TrendingUp, Calendar } from "lucide-react";
import axios from "../lib/axios";

const SalesHeatmap = () => {
  const [heatmapData, setHeatmapData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  useEffect(() => {
    fetchHeatmapData();
  }, [selectedMonth, selectedYear]);

  const fetchHeatmapData = async () => {
    setLoading(true);
    try {
      const response = await axios.get("/analytics/heatmap", {
        params: { month: selectedMonth, year: selectedYear }
      });
      setHeatmapData(response.data.heatmap || []);
    } catch (error) {
      console.error("Isı haritası verileri alınamadı:", error);
    } finally {
      setLoading(false);
    }
  };

  // Haftanın günleri
  const daysOfWeek = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
  
  // Saatler (0-23)
  const hours = Array.from({ length: 24 }, (_, i) => i);

  // Maksimum satış değerini bul (renk skalası için)
  const maxSales = Math.max(...heatmapData.map(d => d.sales || 0), 1);

  // Renk hesaplama fonksiyonu
  const getColor = (sales) => {
    if (!sales || sales === 0) return "bg-gray-800";
    
    const intensity = sales / maxSales;
    
    if (intensity >= 0.8) return "bg-red-500";
    if (intensity >= 0.6) return "bg-orange-500";
    if (intensity >= 0.4) return "bg-yellow-500";
    if (intensity >= 0.2) return "bg-emerald-500";
    return "bg-blue-500";
  };

  // Veriyi gün ve saate göre bul
  const getSalesData = (day, hour) => {
    return heatmapData.find(d => d.dayOfWeek === day && d.hour === hour) || { sales: 0, revenue: 0 };
  };

  // Ay ve yıl seçenekleri
  const months = [
    "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
    "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"
  ];

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  // En yoğun saatler
  const topHours = [...heatmapData]
    .sort((a, b) => b.sales - a.sales)
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-red-500 to-orange-600 rounded-xl">
            <Flame className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">🔥 Satış Isı Haritası</h2>
            <p className="text-gray-400 text-sm">Hangi gün ve saatlerde daha çok satış yapılıyor?</p>
          </div>
        </div>

        {/* Month & Year Selector */}
        <div className="flex gap-3">
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
            className="px-4 py-2 bg-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {months.map((month, index) => (
              <option key={index} value={index}>{month}</option>
            ))}
          </select>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            className="px-4 py-2 bg-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {years.map((year) => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Top Hours Stats */}
      {topHours.length > 0 && (
        <div className="bg-gradient-to-br from-orange-500/10 to-red-500/10 rounded-xl border border-orange-500/20 p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-orange-400" />
            En Yoğun 5 Saat
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {topHours.map((data, index) => (
              <div key={index} className="bg-gray-800/50 rounded-lg p-3 text-center">
                <div className="text-2xl mb-1">
                  {index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : "🏅"}
                </div>
                <div className="text-white font-bold">
                  {daysOfWeek[data.dayOfWeek]} {data.hour}:00
                </div>
                <div className="text-gray-400 text-sm">{data.sales} satış</div>
                <div className="text-emerald-400 text-sm font-semibold">₺{data.revenue?.toFixed(2)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Heatmap */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
        </div>
      ) : (
        <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-6 overflow-x-auto">
          <div className="min-w-max">
            {/* Legend */}
            <div className="flex items-center gap-3 mb-6">
              <span className="text-gray-400 text-sm">Yoğunluk:</span>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-gray-800 rounded"></div>
                <span className="text-gray-400 text-xs">Düşük</span>
                <div className="w-6 h-6 bg-blue-500 rounded"></div>
                <div className="w-6 h-6 bg-emerald-500 rounded"></div>
                <div className="w-6 h-6 bg-yellow-500 rounded"></div>
                <div className="w-6 h-6 bg-orange-500 rounded"></div>
                <div className="w-6 h-6 bg-red-500 rounded"></div>
                <span className="text-gray-400 text-xs">Yüksek</span>
              </div>
            </div>

            {/* Heatmap Grid */}
            <div className="grid gap-1" style={{ gridTemplateColumns: `auto repeat(24, 1fr)` }}>
              {/* Header - Hours */}
              <div className="p-2"></div>
              {hours.map((hour) => (
                <div key={hour} className="p-2 text-center">
                  <span className="text-gray-400 text-xs">{hour}</span>
                </div>
              ))}

              {/* Rows - Days */}
              {daysOfWeek.map((day, dayIndex) => (
                <div key={dayIndex} className="contents">
                  <div className="p-2 flex items-center">
                    <span className="text-gray-400 text-sm font-medium">{day}</span>
                  </div>
                  {hours.map((hour) => {
                    const data = getSalesData(dayIndex, hour);
                    return (
                      <motion.div
                        key={`${dayIndex}-${hour}`}
                        whileHover={{ scale: 1.2, zIndex: 10 }}
                        className={`relative group p-2 rounded ${getColor(data.sales)} cursor-pointer transition-all`}
                        title={`${day} ${hour}:00 - ${data.sales} satış, ₺${data.revenue?.toFixed(2)}`}
                      >
                        {/* Tooltip on hover */}
                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block z-20">
                          <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-xl border border-gray-700 whitespace-nowrap">
                            <div className="font-semibold">{day} {hour}:00</div>
                            <div className="text-gray-400">{data.sales} satış</div>
                            <div className="text-emerald-400">₺{data.revenue?.toFixed(2)}</div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Info */}
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Calendar className="w-5 h-5 text-blue-400 mt-0.5" />
          <div>
            <h4 className="text-white font-semibold mb-1">Nasıl Kullanılır?</h4>
            <p className="text-gray-400 text-sm">
              Bu ısı haritası, hangi gün ve saatlerde daha fazla satış yaptığınızı gösterir. 
              Koyu renkler daha az satış, açık/kırmızı renkler daha fazla satış anlamına gelir. 
              Fareyle üzerine gelerek detaylı bilgi alabilirsiniz.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SalesHeatmap;

