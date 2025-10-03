import axios from "axios";

// Development ve production ortamları için farklı baseURL
const getBaseURL = () => {
	// Development ortamında (Vite dev server)
	if (import.meta.env.DEV) {
		return "http://localhost:5000/api"; // Backend'e direkt bağlan
	}
	// Production ortamında
	return "https://www.devrekbenimmarketim.com/api";
};

const axiosInstance = axios.create({
	baseURL: getBaseURL(),
	withCredentials: true, // send cookies to the server
});

export default axiosInstance;