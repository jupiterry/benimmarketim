import { motion } from "framer-motion";

/**
 * Reusable skeleton loading components.
 * Uses the existing .skeleton class from index.css for shimmer animation.
 */

// ─── Base Skeleton Block ───
export const SkeletonBlock = ({ className = "", rounded = "rounded-lg" }) => (
    <div className={`skeleton ${rounded} ${className}`} />
);

// ─── Product Card Skeleton ───
export const ProductCardSkeleton = () => (
    <motion.div
        className="flex flex-col h-full overflow-hidden rounded-2xl border border-gray-700/50 bg-gradient-to-br from-gray-800/90 to-gray-900/90"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
    >
        {/* Image placeholder */}
        <div className="relative aspect-square bg-gray-800/60 rounded-t-lg">
            <SkeletonBlock className="w-full h-full" rounded="rounded-t-lg" />
        </div>

        {/* Content */}
        <div className="p-3 flex flex-col flex-1">
            {/* Title */}
            <SkeletonBlock className="h-4 w-4/5 mb-2" />
            <SkeletonBlock className="h-4 w-3/5 mb-4" />

            {/* Price */}
            <div className="mt-auto flex items-center gap-2">
                <SkeletonBlock className="h-6 w-20" rounded="rounded-md" />
                <SkeletonBlock className="h-4 w-14" rounded="rounded-md" />
            </div>
        </div>

        {/* Button placeholder */}
        <div className="p-4 pt-0">
            <SkeletonBlock className="h-12 w-full" rounded="rounded-xl" />
        </div>
    </motion.div>
);

// ─── Product Grid Skeleton (multiple cards) ───
export const ProductGridSkeleton = ({ count = 8 }) => (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {Array.from({ length: count }).map((_, i) => (
            <ProductCardSkeleton key={i} />
        ))}
    </div>
);

// ─── Cart Item Skeleton ───
export const CartItemSkeleton = () => (
    <motion.div
        className="flex items-center gap-4 p-4 bg-gray-800/50 rounded-2xl border border-gray-700/30"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
    >
        {/* Image */}
        <SkeletonBlock className="w-20 h-20 flex-shrink-0" rounded="rounded-xl" />

        {/* Details */}
        <div className="flex-1 space-y-2">
            <SkeletonBlock className="h-4 w-3/4" />
            <SkeletonBlock className="h-3 w-1/2" />
            <div className="flex items-center gap-3 mt-2">
                <SkeletonBlock className="h-8 w-24" rounded="rounded-lg" />
                <SkeletonBlock className="h-5 w-16" rounded="rounded-md" />
            </div>
        </div>

        {/* Remove btn */}
        <SkeletonBlock className="w-8 h-8 flex-shrink-0" rounded="rounded-lg" />
    </motion.div>
);

// ─── Category Item Skeleton ───
export const CategoryItemSkeleton = () => (
    <motion.div
        className="flex flex-col items-center gap-3 p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
    >
        <SkeletonBlock className="w-24 h-24" rounded="rounded-2xl" />
        <SkeletonBlock className="h-3 w-20" rounded="rounded-md" />
    </motion.div>
);

// ─── Featured Section Skeleton ───
export const FeaturedSectionSkeleton = () => (
    <div className="relative bg-gray-900/60 rounded-3xl p-8 border border-yellow-500/10">
        {/* Header */}
        <div className="text-center mb-8 space-y-3">
            <SkeletonBlock className="h-8 w-64 mx-auto" rounded="rounded-xl" />
            <SkeletonBlock className="h-4 w-80 mx-auto" rounded="rounded-md" />
        </div>
        {/* Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
            {Array.from({ length: 5 }).map((_, i) => (
                <ProductCardSkeleton key={i} />
            ))}
        </div>
    </div>
);

// ─── Order Summary Skeleton ───
export const OrderSummarySkeleton = () => (
    <motion.div
        className="bg-gray-900/60 rounded-3xl p-8 border border-emerald-500/10 space-y-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
    >
        {/* Title */}
        <div className="text-center">
            <SkeletonBlock className="h-8 w-48 mx-auto mb-4" rounded="rounded-xl" />
        </div>

        {/* Progress bar */}
        <SkeletonBlock className="h-3 w-full" rounded="rounded-full" />

        {/* Delivery points */}
        <div className="grid grid-cols-2 gap-4">
            <SkeletonBlock className="h-32" rounded="rounded-2xl" />
            <SkeletonBlock className="h-32" rounded="rounded-2xl" />
        </div>

        {/* Price rows */}
        <div className="space-y-3">
            <SkeletonBlock className="h-12" rounded="rounded-xl" />
            <SkeletonBlock className="h-12" rounded="rounded-xl" />
            <SkeletonBlock className="h-14" rounded="rounded-xl" />
        </div>

        {/* Button */}
        <SkeletonBlock className="h-12 w-full" rounded="rounded-lg" />
    </motion.div>
);

// ─── Full Page Loading (replaces old spinner) ───
export const PageSkeleton = () => (
    <div className="min-h-screen bg-gray-900 p-6 space-y-8">
        {/* Top bar skeleton */}
        <div className="flex items-center gap-4">
            <SkeletonBlock className="h-10 w-48" rounded="rounded-xl" />
            <SkeletonBlock className="h-10 flex-1 max-w-md" rounded="rounded-xl" />
        </div>

        {/* Content grid */}
        <ProductGridSkeleton count={12} />
    </div>
);

export default {
    SkeletonBlock,
    ProductCardSkeleton,
    ProductGridSkeleton,
    CartItemSkeleton,
    CategoryItemSkeleton,
    FeaturedSectionSkeleton,
    OrderSummarySkeleton,
    PageSkeleton,
};
