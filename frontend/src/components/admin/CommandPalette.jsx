import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Search, Command, ArrowRight, Package2, Users, ShoppingBag, 
  Settings, BarChart2, MessageCircle, Tag, Gift, Image, 
  FileText, Calendar, Upload, PlusCircle, Zap, Sparkles,
  TrendingUp, Clock, Star
} from "lucide-react";

const CommandPalette = ({ isOpen, onClose, onNavigate, currentTab }) => {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);

  const commands = [
    // Navigation
    { id: "dashboard", icon: BarChart2, title: "Dashboard", description: "Ana panel görünümü", category: "Navigasyon", shortcut: "G D", color: "#00f5ff" },
    { id: "orders", icon: Package2, title: "Siparişler", description: "Sipariş yönetimi", category: "Navigasyon", shortcut: "G O", color: "#00ff9d" },
    { id: "products", icon: ShoppingBag, title: "Ürünler", description: "Ürün listesi", category: "Navigasyon", shortcut: "G P", color: "#bf00ff" },
    { id: "users", icon: Users, title: "Kullanıcılar", description: "Kullanıcı yönetimi", category: "Navigasyon", shortcut: "G U", color: "#00f5ff" },
    { id: "chat", icon: MessageCircle, title: "Canlı Sohbet", description: "Müşteri mesajları", category: "Navigasyon", shortcut: "G C", color: "#00ff9d" },
    { id: "coupons", icon: Tag, title: "Kuponlar", description: "Kupon yönetimi", category: "Navigasyon", color: "#ff2d92" },
    { id: "referrals", icon: Gift, title: "Referral", description: "Referans sistemi", category: "Navigasyon", color: "#bf00ff" },
    { id: "banners", icon: Image, title: "Banner'lar", description: "Banner yönetimi", category: "Navigasyon", color: "#00f5ff" },
    { id: "weekly-products", icon: Calendar, title: "Haftalık Ürünler", description: "Öne çıkan ürünler", category: "Navigasyon", color: "#ff6b2c" },
    { id: "settings", icon: Settings, title: "Ayarlar", description: "Sistem ayarları", category: "Navigasyon", shortcut: "G S", color: "#64748b" },
    
    // Quick Actions
    { id: "create", icon: PlusCircle, title: "Yeni Ürün Ekle", description: "Hızlı ürün oluştur", category: "Hızlı Aksiyonlar", shortcut: "N", color: "#00ff9d" },
    { id: "bulk-upload", icon: Upload, title: "Toplu Yükleme", description: "CSV ile ürün yükle", category: "Hızlı Aksiyonlar", color: "#bf00ff" },
    { id: "analytics", icon: TrendingUp, title: "Gelişmiş Analiz", description: "Detaylı raporlar", category: "Hızlı Aksiyonlar", color: "#00f5ff" },
    { id: "photocopy", icon: FileText, title: "Fotokopi", description: "Fotokopi siparişleri", category: "Hızlı Aksiyonlar", color: "#ff6b2c" },
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
            initial={{ opacity: 0, scale: 0.9, y: -30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -30 }}
            transition={{ type: "spring", damping: 30, stiffness: 400 }}
            className="command-palette"
            onClick={(e) => e.stopPropagation()}
            style={{ 
              boxShadow: '0 25px 80px rgba(0, 0, 0, 0.6), 0 0 60px rgba(0, 245, 255, 0.1)'
            }}
          >
            {/* Premium Header */}
            <div className="relative">
              {/* Glow Line */}
              <div 
                className="absolute top-0 left-0 right-0 h-[1px]"
                style={{
                  background: 'linear-gradient(90deg, transparent, rgba(0, 245, 255, 0.5), rgba(191, 0, 255, 0.5), transparent)'
                }}
              />
              
              {/* Search Input */}
              <div className="command-palette-input-wrapper">
                <motion.div
                  animate={{ rotate: [0, 360] }}
                  transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                >
                  <Sparkles className="w-5 h-5 text-[#00f5ff]" />
                </motion.div>
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Sayfa veya komut ara..."
                  className="command-palette-input"
                />
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={onClose}
                  className="px-2.5 py-1 text-xs text-gray-400 bg-white/5 rounded-lg border border-white/10 hover:border-[#00f5ff]/30 hover:text-white transition-all"
                >
                  ESC
                </motion.button>
              </div>
            </div>

            {/* Results */}
            <div className="command-palette-results admin-scrollbar">
              {Object.entries(groupedCommands).map(([category, items], catIdx) => (
                <div key={category} className="command-palette-group">
                  <motion.div 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: catIdx * 0.05 }}
                    className="command-palette-group-title flex items-center gap-2"
                  >
                    {category === "Navigasyon" && <Star className="w-3 h-3 text-[#00f5ff]" />}
                    {category === "Hızlı Aksiyonlar" && <Zap className="w-3 h-3 text-[#ff6b2c]" />}
                    {category}
                  </motion.div>
                  
                  {items.map((cmd, idx) => {
                    const globalIndex = filteredCommands.indexOf(cmd);
                    const isSelected = globalIndex === selectedIndex;
                    const isCurrentPage = currentTab === cmd.id;
                    const Icon = cmd.icon;
                    
                    return (
                      <motion.div
                        key={cmd.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: (catIdx * items.length + idx) * 0.02 }}
                        whileHover={{ x: 4 }}
                        className={`command-palette-item ${isSelected ? 'selected' : ''}`}
                        onClick={() => handleSelect(cmd)}
                        onMouseEnter={() => setSelectedIndex(globalIndex)}
                        style={{
                          borderLeft: isCurrentPage ? `2px solid ${cmd.color}` : undefined,
                          boxShadow: isSelected ? `inset 0 0 30px rgba(0, 245, 255, 0.03)` : undefined
                        }}
                      >
                        {/* Icon */}
                        <motion.div 
                          className="command-palette-item-icon"
                          animate={isSelected ? { scale: [1, 1.1, 1] } : {}}
                          transition={{ duration: 0.3 }}
                          style={{
                            background: isCurrentPage || isSelected 
                              ? `linear-gradient(135deg, ${cmd.color}20, ${cmd.color}10)` 
                              : undefined,
                            color: isCurrentPage || isSelected ? cmd.color : undefined,
                            boxShadow: isSelected ? `0 0 20px ${cmd.color}30` : undefined
                          }}
                        >
                          <Icon className="w-4 h-4" />
                        </motion.div>
                        
                        {/* Content */}
                        <div className="command-palette-item-content">
                          <div className="command-palette-item-title flex items-center gap-2">
                            {cmd.title}
                            {isCurrentPage && (
                              <span 
                                className="text-[10px] px-1.5 py-0.5 rounded-full"
                                style={{ 
                                  background: `${cmd.color}20`,
                                  color: cmd.color
                                }}
                              >
                                Aktif
                              </span>
                            )}
                          </div>
                          <div className="command-palette-item-description">{cmd.description}</div>
                        </div>
                        
                        {/* Shortcut */}
                        {cmd.shortcut && (
                          <div className="command-palette-item-shortcut">
                            {cmd.shortcut.split(' ').map((key, i) => (
                              <kbd 
                                key={i}
                                className="transition-colors"
                                style={{
                                  borderColor: isSelected ? `${cmd.color}30` : undefined
                                }}
                              >
                                {key}
                              </kbd>
                            ))}
                          </div>
                        )}
                        
                        {/* Arrow */}
                        {isSelected && (
                          <motion.div
                            initial={{ opacity: 0, x: -5 }}
                            animate={{ opacity: 1, x: 0 }}
                          >
                            <ArrowRight 
                              className="w-4 h-4" 
                              style={{ color: cmd.color }}
                            />
                          </motion.div>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              ))}
              
              {/* No Results */}
              {filteredCommands.length === 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="py-16 text-center"
                >
                  <motion.div
                    animate={{ 
                      rotate: [0, 10, -10, 0],
                      y: [0, -5, 0]
                    }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <Search className="w-12 h-12 text-gray-700 mx-auto mb-4" />
                  </motion.div>
                  <p className="text-gray-400 font-medium">Sonuç bulunamadı</p>
                  <p className="text-gray-600 text-sm mt-1">Farklı bir anahtar kelime deneyin</p>
                </motion.div>
              )}
            </div>

            {/* Premium Footer */}
            <div 
              className="px-5 py-3 border-t border-white/5 flex items-center justify-between text-xs"
              style={{
                background: 'linear-gradient(90deg, rgba(0, 245, 255, 0.02), transparent, rgba(191, 0, 255, 0.02))'
              }}
            >
              <div className="flex items-center gap-5 text-gray-500">
                <span className="flex items-center gap-1.5">
                  <kbd className="px-1.5 py-0.5 bg-white/5 rounded border border-white/10 text-gray-400">↑</kbd>
                  <kbd className="px-1.5 py-0.5 bg-white/5 rounded border border-white/10 text-gray-400">↓</kbd>
                  <span>gezin</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <kbd className="px-1.5 py-0.5 bg-white/5 rounded border border-white/10 text-gray-400">↵</kbd>
                  <span>seç</span>
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-gray-500">
                <Command className="w-3 h-3 text-[#00f5ff]" />
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
