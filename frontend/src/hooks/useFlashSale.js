import { useState, useEffect, useCallback } from "react";
import axios from "../lib/axios";

/**
 * Custom hook for Flash Sale logic.
 * Shared by ProductCard and FeaturedProducts to avoid ~120 lines of duplication.
 */
const useFlashSale = ({ userRole } = {}) => {
    const [flashSales, setFlashSales] = useState([]);

    // Fetch active flash sales
    const fetchFlashSales = useCallback(async () => {
        try {
            const response = await axios.get("/flash-sales/active");
            setFlashSales(response.data.flashSales || []);
        } catch (error) {
            if (error.response?.status !== 401) {
                console.error("Flash sale'ler getirilemedi:", error);
            }
        }
    }, []);

    // Initial fetch
    useEffect(() => {
        fetchFlashSales();
    }, [fetchFlashSales]);

    // Re-render every minute to update countdown timers
    useEffect(() => {
        const interval = setInterval(() => {
            setFlashSales((prev) => [...prev]);
        }, 60000);
        return () => clearInterval(interval);
    }, []);

    // Cleanup expired flash sales (admin only)
    const cleanupExpiredFlashSale = useCallback(
        async (flashSaleId) => {
            if (userRole && userRole !== "admin") return;
            try {
                await axios.delete(`/flash-sales/${flashSaleId}`);
                setFlashSales((prev) => prev.filter((sale) => sale._id !== flashSaleId));
            } catch (error) {
                console.error("Flash sale silinemedi:", error);
            }
        },
        [userRole]
    );

    // Calculate remaining time string for a product
    const getFlashSaleTimeRemaining = useCallback(
        (productId) => {
            const flashSale = flashSales.find((sale) => sale.product?._id === productId);
            if (!flashSale) return null;

            const now = new Date();
            const start = new Date(flashSale.startDate);
            const end = new Date(flashSale.endDate);

            // Expired → clean up
            if (now > end) {
                cleanupExpiredFlashSale(flashSale._id);
                return null;
            }

            // Not started yet
            if (now < start) {
                const diff = start - now;
                const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

                if (days > 0) return `${days}g ${hours}s sonra başlar`;
                if (hours > 0) return `${hours}s ${minutes}d sonra başlar`;
                return `${minutes}d sonra başlar`;
            }

            // Active → remaining time
            const diff = end - now;
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

            if (days > 0) return `${days}g ${hours}s kaldı`;
            if (hours > 0) return `${hours}s ${minutes}d kaldı`;
            return `${minutes}d kaldı`;
        },
        [flashSales, cleanupExpiredFlashSale]
    );

    // Get flash sale status for a product
    const getFlashSaleStatus = useCallback(
        (productId) => {
            const flashSale = flashSales.find((sale) => sale.product?._id === productId);
            if (!flashSale) return null;

            const now = new Date();
            const start = new Date(flashSale.startDate);
            const end = new Date(flashSale.endDate);

            if (now < start) return "upcoming";
            if (now > end) return "expired";
            return "active";
        },
        [flashSales]
    );

    return {
        flashSales,
        fetchFlashSales,
        getFlashSaleTimeRemaining,
        getFlashSaleStatus,
    };
};

export default useFlashSale;
