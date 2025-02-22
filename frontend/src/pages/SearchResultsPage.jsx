import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import axios from "axios";
import ProductCard from "../components/ProductCard"; // Ürün kartı bileşeninizi içe aktarın

const SearchResultsPage = () => {
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const location = useLocation();
  const query = new URLSearchParams(location.search).get("q");

  useEffect(() => {
    const fetchSearchResults = async () => {
      try {
        const res = await axios.get(`/api/products/search?q=${query}`);
        setProducts(res.data.products);
      } catch (error) {
        console.error("Arama sonuçları alınamadı:", error);
      } finally {
        setIsLoading(false);
      }
    };

    if (query) {
      fetchSearchResults();
    }
  }, [query]);

  return (
    <div className='container mx-auto px-4 py-8'>
      <h1 className='text-2xl font-bold text-emerald-400 mb-4'>
        "{query}" için arama sonuçları
      </h1>
      {isLoading ? (
        <p>Yükleniyor...</p>
      ) : products.length > 0 ? (
        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'>
          {products.map((product) => (
            <ProductCard key={product._id} product={product} />
          ))}
        </div>
      ) : (
        <p>"{query}" ile ilgili ürün bulunamadı.</p>
      )}
    </div>
  );
};

export default SearchResultsPage;