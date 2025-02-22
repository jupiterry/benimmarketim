import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react"; // Arama ikonu için

const SearchBar = () => {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  const handleSearch = (e) => {
    e.preventDefault();
    if (query.trim()) {
      navigate(`/search?q=${query}`);
    }
  };

  return (
    <form onSubmit={handleSearch} className='flex items-center w-full max-w-md'>
      <div className='relative w-full'>
        <input
          type='text'
          placeholder='Ürün ara...'
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className='w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition-all duration-300 bg-white text-gray-800' // 🔥 Arka plan ve metin rengi eklendi
        />
        <Search className='absolute left-3 top-2.5 text-gray-400' size={20} /> {/* 🔥 Arama ikonu */}
      </div>
      <button
        type='submit'
        className='ml-2 px-4 py-2 bg-emerald-400 text-white rounded-lg hover:bg-emerald-500 transition-colors duration-300 flex items-center'
      >
        Ara
      </button>
    </form>
  );
};

export default SearchBar;