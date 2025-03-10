import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X } from "lucide-react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";

const SearchBar = () => {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  const navigate = useNavigate();
  const searchRef = useRef(null);

  // Tıklama dışında kalan alanları kontrol et
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Arama önerilerini getir
  useEffect(() => {
    const getSuggestions = async () => {
      if (query.length < 2) {
        setSuggestions([]);
        return;
      }

      try {
        const response = await axios.get(`/api/products/search?q=${query}`);
        setSuggestions(response.data.products);
      } catch (error) {
        console.error("Öneriler yüklenirken hata:", error);
      }
    };

    const timeoutId = setTimeout(getSuggestions, 300);
    return () => clearTimeout(timeoutId);
  }, [query]);

  const handleSearch = (e) => {
    e?.preventDefault();
    if (query.trim()) {
      navigate(`/search?q=${query}`);
      setShowSuggestions(false);
    }
  };

  return (
    <div className="relative w-full" ref={searchRef}>
      <form onSubmit={handleSearch} className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Ne aramıştınız?"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowSuggestions(true);
            }}
            className="w-full pl-8 pr-8 py-2 border border-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition-all duration-300 bg-white/10 backdrop-blur-md text-white placeholder-gray-400 text-sm"
          />
          <Search className="absolute left-2.5 top-2.5 text-gray-400" size={16} />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setSuggestions([]);
              }}
              className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600"
            >
              <X size={16} />
            </button>
          )}
        </div>

        <button
          type="submit"
          className="min-w-[36px] px-2 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors duration-300 flex items-center justify-center"
        >
          <Search size={16} />
        </button>
      </form>

      {/* Arama Önerileri */}
      <AnimatePresence>
        {showSuggestions && suggestions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-full left-0 right-0 mt-2 bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-50 max-h-[60vh] overflow-auto"
          >
            {suggestions.map((product) => (
              <div
                key={product._id}
                onClick={() => {
                  navigate(`/product/${product._id}`);
                  setShowSuggestions(false);
                }}
                className="flex items-center gap-3 p-2 hover:bg-gray-700 cursor-pointer transition-colors duration-200"
              >
                <img
                  src={product.thumbnail || product.image || "/placeholder.png"}
                  alt={product.name}
                  className="w-10 h-10 object-cover rounded"
                />
                <div className="flex-1 min-w-0">
                  <h4 className="text-white text-sm font-medium truncate">{product.name}</h4>
                  <p className="text-emerald-400 text-xs">₺{product.price.toFixed(2)}</p>
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SearchBar;