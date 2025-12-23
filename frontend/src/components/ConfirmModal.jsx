import { createContext, useContext, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Trash2, X, CheckCircle, AlertCircle, Info } from 'lucide-react';

// Context
const ConfirmContext = createContext(null);

// Hook
export const useConfirm = () => {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error('useConfirm must be used within ConfirmProvider');
  }
  return context;
};

// Modal Component
const ConfirmModal = ({ isOpen, onClose, onConfirm, title, message, confirmText, cancelText, type }) => {
  const getTypeStyles = () => {
    switch (type) {
      case 'danger':
        return {
          icon: Trash2,
          iconBg: 'bg-red-500/20 border-red-500/30',
          iconColor: 'text-red-400',
          confirmBg: 'bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700',
          headerColor: 'text-red-400'
        };
      case 'warning':
        return {
          icon: AlertTriangle,
          iconBg: 'bg-amber-500/20 border-amber-500/30',
          iconColor: 'text-amber-400',
          confirmBg: 'bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700',
          headerColor: 'text-amber-400'
        };
      case 'success':
        return {
          icon: CheckCircle,
          iconBg: 'bg-emerald-500/20 border-emerald-500/30',
          iconColor: 'text-emerald-400',
          confirmBg: 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700',
          headerColor: 'text-emerald-400'
        };
      case 'info':
      default:
        return {
          icon: Info,
          iconBg: 'bg-blue-500/20 border-blue-500/30',
          iconColor: 'text-blue-400',
          confirmBg: 'bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700',
          headerColor: 'text-blue-400'
        };
    }
  };

  const styles = getTypeStyles();
  const Icon = styles.icon;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />
          
          {/* Modal */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative w-full max-w-md bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top gradient line */}
            <div className={`h-1 ${type === 'danger' ? 'bg-gradient-to-r from-red-500 to-rose-500' : type === 'warning' ? 'bg-gradient-to-r from-amber-500 to-orange-500' : type === 'success' ? 'bg-gradient-to-r from-emerald-500 to-teal-500' : 'bg-gradient-to-r from-blue-500 to-indigo-500'}`} />
            
            <div className="p-6">
              {/* Icon & Title */}
              <div className="flex items-start gap-4 mb-4">
                <div className={`flex-shrink-0 p-3 rounded-xl border ${styles.iconBg}`}>
                  <Icon className={`w-6 h-6 ${styles.iconColor}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className={`text-lg font-bold ${styles.headerColor} mb-1`}>
                    {title}
                  </h3>
                  <p className="text-gray-300 text-sm leading-relaxed">
                    {message}
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="flex-shrink-0 p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500 hover:text-white" />
                </button>
              </div>

              {/* Actions */}
              <div className="flex gap-3 mt-6">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={onClose}
                  className="flex-1 px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium rounded-xl transition-all"
                >
                  {cancelText}
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    onConfirm();
                    onClose();
                  }}
                  className={`flex-1 px-4 py-3 text-white font-semibold rounded-xl shadow-lg transition-all ${styles.confirmBg}`}
                >
                  {confirmText}
                </motion.button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// Provider Component
export const ConfirmProvider = ({ children }) => {
  const [confirmState, setConfirmState] = useState({
    isOpen: false,
    title: 'Emin misiniz?',
    message: '',
    confirmText: 'Onayla',
    cancelText: 'İptal',
    type: 'warning', // 'danger', 'warning', 'success', 'info'
    onConfirm: () => {},
  });

  const confirm = useCallback(({ title, message, confirmText = 'Onayla', cancelText = 'İptal', type = 'warning' }) => {
    return new Promise((resolve) => {
      setConfirmState({
        isOpen: true,
        title,
        message,
        confirmText,
        cancelText,
        type,
        onConfirm: () => resolve(true),
      });
    });
  }, []);

  const handleClose = useCallback(() => {
    setConfirmState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <ConfirmModal
        isOpen={confirmState.isOpen}
        onClose={handleClose}
        onConfirm={confirmState.onConfirm}
        title={confirmState.title}
        message={confirmState.message}
        confirmText={confirmState.confirmText}
        cancelText={confirmState.cancelText}
        type={confirmState.type}
      />
    </ConfirmContext.Provider>
  );
};

export default ConfirmModal;
