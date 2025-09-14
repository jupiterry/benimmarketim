import axios from "axios";

// Development ve production ortamları için farklı baseURL
const getBaseURL = () => {
	// Development ortamında (Vite dev server)
	if (import.meta.env.DEV) {
		return "/api"; // Vite proxy kullan
	}
	// Production ortamında
	return "https://www.devrekbenimmarketim.com/api";
};

const axiosInstance = axios.create({
	baseURL: getBaseURL(),
	withCredentials: true, // send cookies to the server
});

export default axiosInstance;