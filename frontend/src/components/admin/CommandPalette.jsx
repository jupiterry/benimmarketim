import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Search, Command, ArrowRight, Package2, Users, ShoppingBag, 
  Settings, BarChart2, MessageCircle, Tag, Gift, Image, 
  FileText, Calendar, Upload, PlusCircle, Bell, Zap
} from "lucide-react";

const CommandPalette = ({ isOpen, onClose, onNavigate, currentTab }) => {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);

  const commands = [
    // Navigasyon
    { id: "dashboard", icon: BarChart2, title: "Dashboard", description: "Ana panel görünümü", category: "Navigasyon", shortcut: "G D" },
    { id: "orders", icon: Package2, title: "Siparişler", description: "Sipariş yönetimi", category: "Navigasyon", shortcut: "G O" },
    { id: "products", icon: ShoppingBag, title: "Ürünler", description: "Ürün listesi", category: "Navigasyon", shortcut: "G P" },
    { id: "users", icon: Users, title: "Kullanıcılar", description: "Kullanıcı yönetimi", category: "Navigasyon", shortcut: "G U" },
    { id: "chat", icon: MessageCircle, title: "Canlı Sohbet", description: "Müşteri mesajları", category: "Navigasyon", shortcut: "G C" },
    { id: "coupons", icon: Tag, title: "Kuponlar", description: "Kupon yönetimi", category: "Navigasyon" },
    { id: "referrals", icon: Gift, title: "Referral", description: "Referans sistemi", category: "Navigasyon" },
    { id: "banners", icon: Image, title: "Banner'lar", description: "Banner yönetimi", category: "Navigasyon" },
    { id: "weekly-products", icon: Calendar, title: "Haftalık Ürünler", description: "Öne çıkan ürünler", category: "Navigasyon" },
    { id: "settings", icon: Settings, title: "Ayarlar", description: "Sistem ayarları", category: "Navigasyon", shortcut: "G S" },
    
    // Hızlı Aksiyonlar
    { id: "create", icon: PlusCircle, title: "Yeni Ürün Ekle", description: "Hızlı ürün oluştur", category: "Hızlı Aksiyonlar", shortcut: "N" },
    { id: "bulk-upload", icon: Upload, title: "Toplu Yükleme", description: "CSV ile ürün yükle", category: "Hızlı Aksiyonlar" },
    { id: "analytics", icon: BarChart2, title: "Gelişmiş Analiz", description: "Detaylı raporlar", category: "Hızlı Aksiyonlar" },
    { id: "photocopy", icon: FileText, title: "Fotokopi", description: "Fotokopi siparişleri", category: "Hızlı Aksiyonlar" },
  ];

  const filteredCommands = commands.filter(
    cmd => 
      cmd.title.toLowerCase().includes(query.toLowerCase()) ||
      cmd.description.toLowerCase().includes(query.toLowerCase()) ||
      cmd.category.toLowerCase().includes(query.toLowerCase())
  );

  const groupedCommands = filteredCommands.reduce((acc, cmd) => {
    if (!acc[cmd.category]) acc[cmd.category] = [];
    acc[cmd.category].push(cmd);
    return acc;
  }, {});

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < filteredCommands.length - 1 ? prev + 1 : 0
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex(prev => 
          prev > 0 ? prev - 1 : filteredCommands.length - 1
        );
      } else if (e.key === "Enter" && filteredCommands[selectedIndex]) {
        e.preventDefault();
        handleSelect(filteredCommands[selectedIndex]);
      } else if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, selectedIndex, filteredCommands, onClose]);

  const handleSelect = (command) => {
    onNavigate(command.id);
    onClose();
    setQuery("");
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="command-palette-backdrop"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="command-palette"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search Input */}
            <div className="command-palette-input-wrapper">
              <Search className="w-5 h-5 text-gray-500" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Sayfa veya komut ara..."
                className="command-palette-input"
              />
              <button
                onClick={onClose}
                className="px-2 py-1 text-xs text-gray-500 bg-gray-800 rounded border border-gray-700 hover:border-gray-600"
              >
                ESC
              </button>
            </div>

            {/* Results */}
            <div className="command-palette-results admin-scrollbar">
              {Object.entries(groupedCommands).map(([category, items]) => (
                <div key={category} className="command-palette-group">
                  <div className="command-palette-group-title">{category}</div>
                  {items.map((cmd, idx) => {
                    const globalIndex = filteredCommands.indexOf(cmd);
                    const isSelected = globalIndex === selectedIndex;
                    const Icon = cmd.icon;
                    
                    return (
                      <motion.div
                        key={cmd.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.02 }}
                        className={`command-palette-item ${isSelected ? 'selected' : ''} ${currentTab === cmd.id ? 'border-l-2 border-emerald-500' : ''}`}
                        onClick={() => handleSelect(cmd)}
                        onMouseEnter={() => setSelectedIndex(globalIndex)}
                      >
                        <div className={`command-palette-item-icon ${currentTab === cmd.id ? 'bg-emerald-500/20 text-emerald-400' : ''}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="command-palette-item-content">
                          <div className="command-palette-item-title">{cmd.title}</div>
                          <div className="command-palette-item-description">{cmd.description}</div>
                        </div>
                        {cmd.shortcut && (
                          <div className="command-palette-item-shortcut">
                            {cmd.shortcut.split(' ').map((key, i) => (
                              <kbd key={i}>{key}</kbd>
                            ))}
                          </div>
                        )}
                        {isSelected && (
                          <ArrowRight className="w-4 h-4 text-emerald-400" />
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              ))}
              
              {filteredCommands.length === 0 && (
                <div className="py-12 text-center">
                  <Zap className="w-10 h-10 text-gray-700 mx-auto mb-3" />
                  <p className="text-gray-500">Sonuç bulunamadı</p>
                  <p className="text-gray-600 text-sm mt-1">Farklı bir arama deneyin</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-gray-800 flex items-center justify-between text-xs text-gray-500">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-gray-800 rounded border border-gray-700">↑</kbd>
                  <kbd className="px-1.5 py-0.5 bg-gray-800 rounded border border-gray-700">↓</kbd>
                  gezin
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-gray-800 rounded border border-gray-700">↵</kbd>
                  seç
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Command className="w-3 h-3" />
                <span>+ K ile aç</span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default CommandPalette;
