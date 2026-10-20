import axios from "axios";

// Hem geliştirme hem üretimde aynı origin üzerinden /api kullanılır.
// Geliştirmede Vite dev sunucusu /api isteklerini vite.config.js'deki
// proxy ile http://localhost:5000'e iletir; böylece çerezler ve CORS sorunsuz çalışır.
const axiosInstance = axios.create({
	baseURL: "/api",
	withCredentials: true, // send cookies to the server
});

export default axiosInstance;
