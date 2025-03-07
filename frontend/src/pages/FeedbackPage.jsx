import FeedbackForm from "../components/FeedbackForm";
import { motion } from "framer-motion";

const FeedbackPage = () => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 py-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <h1 className="text-4xl font-bold bg-gradient-to-r from-emerald-400 to-teal-500 bg-clip-text text-transparent mb-4">
            Geri Bildirim
          </h1>
          <p className="text-gray-400 text-lg">
            Düşüncelerinizi bizimle paylaşın, sizin için daha iyi olmak istiyoruz
          </p>
        </motion.div>

        <FeedbackForm />
      </div>
    </div>
  );
};

export default FeedbackPage; 