import { motion, AnimatePresence } from "framer-motion";
import { XCircle, AlertTriangle, X } from "lucide-react";

const CancelOrderModal = ({ isOpen, onClose, onConfirm, orderInfo }) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: "spring", duration: 0.3 }}
          className="relative bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-gray-700"
        >
          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Header */}
          <div className="bg-gradient-to-br from-red-500/20 to-orange-500/20 p-6 border-b border-gray-700">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-red-500/20 rounded-full">
                <AlertTriangle className="w-8 h-8 text-red-500" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">Siparişi İptal Et</h3>
                <p className="text-sm text-gray-400 mt-1">Bu işlem geri alınamaz</p>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="p-6 space-y-4">
            <p className="text-gray-300 text-base leading-relaxed">
              <span className="font-semibold text-white">#{orderInfo?.orderId?.slice(-8)}</span> numaralı siparişinizi 
              iptal etmek istediğinize emin misiniz?
            </p>

            {orderInfo?.totalAmount && (
              <div className="bg-gray-700/50 rounded-lg p-4 border border-gray-600">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">Sipariş Tutarı</span>
                  <span className="text-white font-bold text-lg">₺{orderInfo.totalAmount.toFixed(2)}</span>
                </div>
              </div>
            )}

            <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-lg p-4">
              <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-200">
                Siparişiniz iptal edildiğinde, bu işlem geri alınamaz. Tekrar sipariş vermek isterseniz 
                sepetinizi yeniden oluşturmanız gerekecektir.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="bg-gray-700/30 p-6 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-xl transition-colors"
            >
              Vazgeç
            </button>
            <button
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 text-white font-medium rounded-xl transition-all shadow-lg shadow-red-500/25 flex items-center justify-center gap-2"
            >
              <XCircle className="w-5 h-5" />
              İptal Et
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default CancelOrderModal;

