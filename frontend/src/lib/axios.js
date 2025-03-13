import axios from "axios";

const axiosInstance = axios.create({
	baseURL: "/api",  // Vite proxy bu yolu kullanarak localhost:5000/api'ye yönlendirecek
	withCredentials: true, // send cookies to the server
});

export default axiosInstance;