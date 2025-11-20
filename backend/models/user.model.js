import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
	{
		name: {
			type: String,
			required: [true, "İsim ve soyisim zorunludur"],
			validate: {
				validator: function(value) {
					// En az iki kelime ve her kelime en az 2 karakter olmalı
					const words = value.trim().split(/\s+/);
					return words.length >= 2 && words.every(word => word.length >= 2);
				},
				message: "Lütfen geçerli bir isim ve soyisim giriniz (örn: Ahmet Yılmaz)"
			}
		},
		email: {
			type: String,
			required: [true, "Email is required"],
			unique: true,
			lowercase: true,
			trim: true,
		},
		password: {
			type: String,
			required: [true, "Password is required"],
			minlength: [6, "Password must be at least 6 characters long"],
		},
		phone: {
			type: String,
			trim: true,
		},
		lastActive: {
			type: Date,
			default: Date.now
		},
		cartItems: [
			{
				quantity: {
					type: Number,
					default: 1,
				},
				product: {
					type: mongoose.Schema.Types.ObjectId,
					ref: "Product",
				},
				addedAt: {
					type: Date,
					default: Date.now,
				},
			},
		],
		cartLastUpdated: {
			type: Date,
			default: Date.now,
		},
		fcmToken: {
			type: String,
			default: null,
		},
		pushNotificationsEnabled: {
			type: Boolean,
			default: true,
		},
		role: {
			type: String,
			enum: ["customer", "admin"],
			default: "customer",
		},
		hasFeedback: {
			type: Boolean,
			default: false
		},
		deviceType: {
			type: String,
			enum: ["desktop", "mobile", "tablet", "unknown"],
			default: "unknown"
		},
		lastDeviceType: {
			type: String,
			enum: ["desktop", "mobile", "tablet", "unknown"],
			default: "unknown"
		}
	},
	{
		timestamps: true,
	}
);

// Pre-save hook to hash password before saving to database
userSchema.pre("save", async function (next) {
	if (!this.isModified("password")) return next();

	try {
		const salt = await bcrypt.genSalt(10);
		this.password = await bcrypt.hash(this.password, salt);
		next();
	} catch (error) {
		next(error);
	}
});

userSchema.methods.comparePassword = async function (password) {
	return bcrypt.compare(password, this.password);
};

const User = mongoose.model("User", userSchema);

export default User;
