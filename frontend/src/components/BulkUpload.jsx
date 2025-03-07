import { useState } from "react";
import axios from "../lib/axios";
import { Toaster, toast } from "react-hot-toast";

const BulkUpload = () => {
    const [file, setFile] = useState(null); // Seçilen dosya
    const [isLoading, setIsLoading] = useState(false); // Yükleme durumu

    // Kullanıcı dosya seçtiğinde çalışır
    const handleFileChange = (e) => {
        setFile(e.target.files[0]);
    };

    // Form gönderildiğinde çalışır
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!file) {
            toast.error("Lütfen bir dosya seçin.");
            return;
        }
    
        setIsLoading(true);
    
        const formData = new FormData();
        formData.append("file", file);
    
        try {
            const response = await axios.post("/products/bulk-upload", formData, {
                headers: {
                    "Content-Type": "multipart/form-data",
                },
            });
            toast.success(response.data.message);
        } catch (error) {
            console.error("Dosya yüklenirken hata:", error);
            console.error("Hata Detayı:", error.response?.data); // Backend'den gelen hata mesajını logla
            toast.error("Dosya yüklenirken hata oluştu.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold text-white mb-4">Toplu Ürün Yükleme</h2>
            <form onSubmit={handleSubmit}>
                <input
                    type="file"
                    accept=".csv" // Sadece CSV dosyaları kabul et
                    onChange={handleFileChange}
                    className="mb-4"
                />
                <button
                    type="submit"
                    className="bg-blue-500 text-white p-2 rounded-md"
                    disabled={isLoading} // Yükleme sırasında butonu devre dışı bırak
                >
                    {isLoading ? "Yükleniyor..." : "Yükle"}
                </button>
            </form>
            <Toaster />
        </div>
    );
};

export default BulkUpload;