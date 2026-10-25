import { redis } from "../lib/redis.js";
import User from "../models/user.model.js";
import jwt from "jsonwebtoken";
import cloudinary, { publicIdFromUrl } from "../lib/cloudinary.js";
import { processReferralSignup } from "./referral.controller.js";
import { noteAppRequest } from "../services/appActivity.service.js";
import { deleteUserAccount } from "../services/account.service.js";

// Türkiye cep telefonu: boşluk, tire, parantez ve +90/90 öneki temizlenir; 05XXXXXXXXX olarak saklanır.
export const normalizeTurkishPhone = (value) => {
	if (typeof value !== "string") return null;
	let digits = value.replace(/[\s\-()]/g, "");
	if (digits.startsWith("+90")) digits = digits.slice(3);
	else if (digits.startsWith("0090")) digits = digits.slice(4);
	else if (digits.length === 12 && digits.startsWith("90")) digits = digits.slice(2);
	if (!/^\d+$/.test(digits)) return null;
	if (digits.length === 10 && digits.startsWith("5")) digits = `0${digits}`;
	if (digits.length !== 11 || !digits.startsWith("05")) return null;
	return digits;
};

// Profil fotoğrafı: yalnızca data URL (jpeg/jpg/png/webp) ve en fazla ~5 MB base64
const AVATAR_DATA_URL = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=\s]+)$/;
const AVATAR_MAX_BASE64_LENGTH = 5 * 1024 * 1024;
const AVATAR_FOLDER = "avatars";

// Sunucu loglarına kişisel veri (e-posta, telefon, parola özeti, kupon kodu) yazılmaz; kayıtlarda
// yalnızca kullanıcı kimliği geçer. Hatalarda türü ve takılan alan adları yazılır: Mongo'nun
// "duplicate key" ve Mongoose'un CastError iletileri gönderilen değeri (e-posta/telefon) içerir.
export const safeErrorSummary = (error) => {
	if (!error) return "bilinmeyen hata";
	const fields = (obj) => Object.keys(obj || {}).join(", ") || "?";
	if (error.code === 11000) return `E11000 yinelenen kayıt (alan: ${fields(error.keyPattern || error.keyValue)})`;
	if (error.name === "ValidationError" && error.errors) return `ValidationError (alan: ${fields(error.errors)})`;
	if (error.name === "CastError") return `CastError (alan: ${error.path || "?"})`;
	return `${error.name || "Error"}: ${error.message}`;
};

const generateTokens = (userId) => {
	// Access token artık çok uzun süreli (1 yıl) - kullanıcı kendisi çıkış yapana kadar geçerli
	const accessToken = jwt.sign({ userId }, process.env.ACCESS_TOKEN_SECRET, {
		expiresIn: "365d", // 1 yıl
	});

	const refreshToken = jwt.sign({ userId }, process.env.REFRESH_TOKEN_SECRET, {
		expiresIn: "365d", // 1 yıl
	});

	return { accessToken, refreshToken };
};

const storeRefreshToken = async (userId, refreshToken) => {
	await redis.set(`refresh_token:${userId}`, refreshToken, "EX", 365 * 24 * 60 * 60); // 365 days (1 yıl)
};

const setCookies = (res, accessToken, refreshToken) => {
	res.cookie("accessToken", accessToken, {
		httpOnly: true, // prevent XSS attacks, cross site scripting attack
		secure: process.env.NODE_ENV === "production",
		sameSite: "strict", // prevents CSRF attack, cross-site request forgery attack
		maxAge: 365 * 24 * 60 * 60 * 1000, // 1 yıl - kullanıcı kendisi çıkış yapana kadar geçerli
	});
	res.cookie("refreshToken", refreshToken, {
		httpOnly: true, // prevent XSS attacks, cross site scripting attack
		secure: process.env.NODE_ENV === "production",
		sameSite: "strict", // prevents CSRF attack, cross-site request forgery attack
		maxAge: 365 * 24 * 60 * 60 * 1000, // 1 yıl
	});
};

export const signup = async (req, res) => {
	const { email, password, name, phone, deviceType, referralCode } = req.body;
	try {
		// Mongo operatör enjeksiyonu: e-posta/şifre yalnızca düz metin olabilir
		if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
			return res.status(400).json({ message: "E-posta ve şifre zorunludur" });
		}
		if (typeof name !== "string") {
			return res.status(400).json({ message: "İsim ve soyisim zorunludur" });
		}
		if (phone !== undefined && phone !== null && phone !== "" && typeof phone !== "string") {
			return res.status(400).json({ message: "Geçersiz telefon numarası" });
		}
		if (referralCode !== undefined && referralCode !== null && typeof referralCode !== "string") {
			return res.status(400).json({ message: "Geçersiz referral kodu" });
		}
		const userExists = await User.findOne({ email: email.trim().toLowerCase() });

		if (userExists) {
			return res.status(400).json({ message: "Kullanıcı zaten mevcut" });
		}
		const user = await User.create({ name, email, password, phone, deviceType });
		console.log(`Yeni kullanıcı kaydı: ${user._id}`);

		// Referral kodu işleme
		let referralResult = null;
		if (referralCode) {
			try {
				referralResult = await processReferralSignup(referralCode, user._id);
				if (referralResult.success) {
					console.log(`Referral işlemi başarılı (kullanıcı ${user._id})`);
				}
			} catch (refError) {
				console.error(`Referral işlemi hatası (kullanıcı ${user._id}):`, safeErrorSummary(refError));
			}
		}

		// authenticate
		const { accessToken, refreshToken } = generateTokens(user._id);
		await storeRefreshToken(user._id, refreshToken);

		setCookies(res, accessToken, refreshToken);

		res.status(201).json({
			_id: user._id,
			name: user.name,
			email: user.email,
			role: user.role,
			phone: user.phone,
			avatar: user.avatar || null,
			accessToken: accessToken, // Flutter için token'ı response'da gönder
			refreshToken: refreshToken, // Flutter için refresh token'ı da gönder
			referralCoupon: referralResult?.couponCode || null // Referral kuponu
		});
	} catch (error) {
		console.log("Error in signup controller", safeErrorSummary(error));
		res.status(500).json({ message: error.message });
	}
};

export const login = async (req, res) => {
	try {
		const { email, password, deviceType } = req.body;
		if (typeof email !== "string" || typeof password !== "string") {
			return res.status(400).json({ message: "Geçersiz E-posta veya Şifre" });
		}
		const user = await User.findOne({ email: email.trim().toLowerCase() });

		if (user && (await user.comparePassword(password))) {
			// Update device type and last login time
			user.lastDeviceType = user.deviceType;
			if (deviceType) {
				user.deviceType = deviceType;
			}
			user.lastLoginAt = new Date();
			user.lastActive = new Date();
			// Yalnızca değişen alanlar doğrulanır: kuraldan önce açılmış (ör. tek kelimelik
			// isimli) hesaplar giriş yaparken ya da profil güncellerken takılmasın.
			await user.save({ validateModifiedOnly: true });
			
			const { accessToken, refreshToken } = generateTokens(user._id);
			await storeRefreshToken(user._id, refreshToken);
			setCookies(res, accessToken, refreshToken);

			console.log(`Giriş başarılı: ${user._id}`);

			// Uygulamadan giriş yapıldıysa yönetici paneline "uygulamayı açtı" bildirimi düşer
			noteAppRequest(req, null, user);

			res.json({
				_id: user._id,
				name: user.name,
				email: user.email,
				role: user.role,
				phone: user.phone,
				avatar: user.avatar || null,
				accessToken: accessToken, // Flutter için token'ı response'da gönder
				refreshToken: refreshToken // Flutter için refresh token'ı da gönder
			});
		} else {
			res.status(400).json({ message: "Geçersiz E-posta veya Şifre" });
		}
	} catch (error) {
		console.log("Error in login controller", safeErrorSummary(error));
		res.status(500).json({ message: error.message });
	}
};

export const logout = async (req, res) => {
	try {
		const refreshToken = req.cookies.refreshToken;
		if (refreshToken) {
			try {
				// #5 — Token süresi dolmuş veya geçersizse hata fırlatabilir.
				// Bu hatayı yakala; kullanıcı her durumda çıkış yapabilmeli.
				const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
				await redis.del(`refresh_token:${decoded.userId}`);
			} catch {
				// Token zaten geçersiz — Redis'teki karşılığı varsa bile
				// ilgili anahtar TTL ile kendiliğinden sona erecek. Sessizce devam et.
			}
		}

		res.clearCookie("accessToken");
		res.clearCookie("refreshToken");
		res.json({ message: "Başarıyla çıkış yapıldı." });
	} catch (error) {
		console.error("Logout hatası:", error.message);
		res.status(500).json({ message: "Server error", error: error.message });
	}
};

// this will refresh the access token
export const refreshToken = async (req, res) => {
	try {
		// Flutter'dan gelen refresh token'ı body'den al
		const refreshToken = req.body?.refreshToken || req.cookies.refreshToken;
		
		if (!refreshToken || typeof refreshToken !== "string") {
			return res.status(401).json({ message: "No refresh token provided" });
		}

		console.log("Refresh token request received"); // Debug log

		const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
		const storedToken = await redis.get(`refresh_token:${decoded.userId}`);

		if (storedToken !== refreshToken) {
			return res.status(401).json({ message: "Invalid refresh token" });
		}

		const accessToken = jwt.sign({ userId: decoded.userId }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "365d" }); // 1 yıl

		// Cookie'yi de güncelle
		res.cookie("accessToken", accessToken, {
			httpOnly: true,
			secure: process.env.NODE_ENV === "production",
			sameSite: "strict",
			maxAge: 365 * 24 * 60 * 60 * 1000, // 1 yıl
		});

		console.log("Token refreshed successfully"); // Debug log

		// Flutter için yeni access token'ı response'da gönder
		res.json({ 
			message: "Token refreshed successfully",
			accessToken: accessToken
		});
	} catch (error) {
		// Süresi dolmuş / bozuk token: istemci yeniden giriş yapmalı → 401
		if (error.name === "TokenExpiredError" || error.name === "JsonWebTokenError" || error.name === "NotBeforeError") {
			return res.status(401).json({ message: "Invalid refresh token" });
		}
		console.log("Error in refreshToken controller", error.message);
		res.status(500).json({ message: "Server error", error: error.message });
	}
};

export const getProfile = async (req, res) => {
	try {
		res.json(req.user);
	} catch (error) {
		res.status(500).json({ message: "Server error", error: error.message });
	}
};

// Test endpoint'leri
// Kullanıcı kendi hesabını silme
export const deleteMyAccount = async (req, res) => {
	try {
		// Güvenlik: Sadece authenticated kullanıcının kendi ID'sini kullan
		// Body'den veya params'tan gelen userId parametreleri yok sayılır
		const userId = req.user._id || req.user.id;
		
		if (!userId) {
			return res.status(401).json({ message: "Kullanıcı kimliği bulunamadı" });
		}

		await deleteUserAccount(userId);

		// Cookie'leri temizle
		res.clearCookie("accessToken");
		res.clearCookie("refreshToken");

		console.log(`Kullanıcı hesabı silindi - ID: ${userId}`);

		res.json({ 
			message: "Hesabınız başarıyla silindi",
			deletedAt: new Date().toISOString()
		});
	} catch (error) {
		console.error(`Hesap silme hatası (kullanıcı ${req.user?._id}):`, safeErrorSummary(error));
		res.status(500).json({ message: "Hesap silinirken hata oluştu", error: error.message });
	}
};

// PUT /api/auth/update-phone  { phone }  → { message, phone }
export const updatePhone = async (req, res) => {
	try {
		const phone = normalizeTurkishPhone(req.body?.phone);
		if (!phone) {
			return res.status(400).json({ message: "Geçerli bir telefon numarası girin (örn. 05XXXXXXXXX)" });
		}
		req.user.phone = phone;
		await req.user.save({ validateModifiedOnly: true });
		res.json({ message: "Telefon numarası güncellendi", phone });
	} catch (error) {
		console.error(`Telefon güncelleme hatası (kullanıcı ${req.user?._id}):`, safeErrorSummary(error));
		res.status(500).json({ message: "Telefon numarası güncellenemedi", error: error.message });
	}
};

// PUT /api/auth/profile-photo  { image: "data:image/...;base64,..." }  → { message, avatar }
export const updateProfilePhoto = async (req, res) => {
	try {
		const image = req.body?.image;
		if (typeof image !== "string" || image.length > AVATAR_MAX_BASE64_LENGTH + 64) {
			return res.status(400).json({ message: "Fotoğraf en fazla 5 MB olabilir (JPEG, PNG veya WebP)" });
		}
		const match = image.match(AVATAR_DATA_URL);
		if (!match || match[2].length > AVATAR_MAX_BASE64_LENGTH) {
			return res.status(400).json({ message: "Geçersiz fotoğraf. JPEG, PNG veya WebP yükleyin (en fazla 5 MB)" });
		}

		let uploaded;
		try {
			uploaded = await cloudinary.uploader.upload(image, {
				folder: AVATAR_FOLDER,
				transformation: { width: 512, height: 512, crop: "fill", gravity: "face" },
			});
		} catch (uploadError) {
			// Cloudinary hataları bazen { error: { message, http_code } } biçiminde gelir
			const reason = uploadError?.message || uploadError?.error?.message || String(uploadError);
			const code = uploadError?.http_code || uploadError?.error?.http_code;
			console.error(
				`Cloudinary avatar yükleme hatası (kullanıcı ${req.user._id}${code ? `, http ${code}` : ""}):`,
				reason,
				process.env.CLOUDINARY_CLOUD_NAME ? "" : "— CLOUDINARY_CLOUD_NAME tanımlı değil"
			);
			return res.status(502).json({ message: "Fotoğraf görsel sunucusuna yüklenemedi, lütfen tekrar deneyin" });
		}

		// Eski fotoğrafı Cloudinary'den kaldır (hata yeni fotoğrafı etkilemez)
		const previousId = publicIdFromUrl(req.user.avatar);
		if (previousId && previousId !== uploaded.public_id) {
			cloudinary.uploader.destroy(previousId).catch((err) => {
				console.error("Eski avatar silinemedi:", err.message);
			});
		}

		req.user.avatar = uploaded.secure_url;
		await req.user.save({ validateModifiedOnly: true });
		res.json({ message: "Profil fotoğrafı güncellendi", avatar: req.user.avatar });
	} catch (error) {
		console.error(`Profil fotoğrafı kaydedilemedi (kullanıcı ${req.user?._id}):`, error.message);
		res.status(500).json({ message: "Profil fotoğrafı kaydedilemedi, lütfen tekrar deneyin", error: error.message });
	}
};

// DELETE /api/auth/profile-photo  → { message, avatar: null }
export const deleteProfilePhoto = async (req, res) => {
	try {
		const previousId = publicIdFromUrl(req.user.avatar);
		if (previousId) {
			try {
				await cloudinary.uploader.destroy(previousId);
			} catch (err) {
				console.error("Avatar Cloudinary'den silinemedi:", err.message);
			}
		}
		req.user.avatar = null;
		await req.user.save({ validateModifiedOnly: true });
		res.json({ message: "Profil fotoğrafı kaldırıldı", avatar: null });
	} catch (error) {
		console.error("Profil fotoğrafı silme hatası:", error.message);
		res.status(500).json({ message: "Profil fotoğrafı kaldırılamadı", error: error.message });
	}
};
