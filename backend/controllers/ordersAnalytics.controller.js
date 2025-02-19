import Order from "../models/order.model.js";
import User from "../models/user.model.js";

// Tüm siparişleri getirirken "status" bilgisini de ekleyelim
export const getOrderAnalyticsData = async () => {
    try {
        const totalOrders = await Order.countDocuments();
        const orders = await Order.find()
            .populate("user", "name email")
            .populate("products.product", "name price");

        // Siparişleri gruplarken null kontrolü ekleyelim
        const groupedOrders = orders.reduce((acc, order) => {
            // Eğer user veya products eksikse, bu siparişi atla
            if (!order.user || !order.products) {
                console.log("Eksik veriler: ", order);
                return acc;
            }

            const userId = order.user._id.toString();
            if (!acc[userId]) {
                acc[userId] = {
                    user: {
                        id: order.user._id,
                        name: order.user.name || "Bilinmeyen Kullanıcı",  // Varsayılan değer
                        email: order.user.email,
                        phone: order.phone,
                        address: `${order.city}`,
                    },
                    orders: [],
                };
            }

            acc[userId].orders.push({
                orderId: order._id,
                products: order.products.map(p => ({
                    name: p.product?.name || "Bilinmeyen Ürün",  // Varsayılan değer
                    quantity: p.quantity,
                    price: p.product?.price || 0,  // Varsayılan değer
                })),
                totalAmount: order.totalAmount,
                status: order.status,
                createdAt: order.createdAt,
            });

            return acc;
        }, {});

        return {
            totalOrders,
            usersOrders: Object.values(groupedOrders),
        };
    } catch (error) {
        console.error("Siparişler alınırken hata oluştu:", error.message);
        throw error;
    }
};


// Admin sipariş durumunu günceller
export const updateOrderStatus = async (req, res) => {
    try {
        const { orderId, status } = req.body;

        if (!["Hazırlanıyor", "Yolda", "Teslim Edildi"].includes(status)) {
            return res.status(400).json({ message: "Geçersiz sipariş durumu!" });
        }

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ message: "Sipariş bulunamadı!" });
        }

        order.status = status;
        await order.save();

        res.json({ message: "Sipariş durumu başarıyla güncellendi!", order });
    } catch (error) {
        console.error("Sipariş durumu güncellenirken hata:", error.message);
        res.status(500).json({ message: "Server hatası", error: error.message });
    }
};

// Günlük sipariş verilerini getiren fonksiyon
export const getDailyOrdersData = async (startDate, endDate) => {
    try {
        const dailyOrdersData = await Order.aggregate([
            {
                $match: {
                    createdAt: {
                        $gte: startDate,
                        $lte: endDate,
                    },
                },
            },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    orders: { $sum: 1 },
                    revenue: { $sum: "$totalAmount" },
                },
            },
            { $sort: { _id: 1 } },
        ]);

        const dateArray = getDatesInRange(startDate, endDate);

        return dateArray.map((date) => {
            const foundData = dailyOrdersData.find((item) => item._id === date);
            return {
                date,
                orders: foundData?.orders || 0,
                revenue: foundData?.revenue || 0,
            };
        });
    } catch (error) {
        console.error("Günlük sipariş verileri alınırken hata:", error.message);
        throw error;
    }
};

function getDatesInRange(startDate, endDate) {
    const dates = [];
    let currentDate = new Date(startDate);

    while (currentDate <= endDate) {
        dates.push(currentDate.toISOString().split("T")[0]);
        currentDate.setDate(currentDate.getDate() + 1);
    }

    return dates;
}

// Kullanıcının kendi siparişlerini getiren fonksiyon
export const getUserOrders = async (req, res) => {
    try {
        const userId = req.user._id; // Kullanıcının ID'sini al
        const orders = await Order.find({ user: userId })
            .populate("products.product", "name price")
            .sort({ createdAt: -1 });

        res.json(orders);
    } catch (error) {
        console.error("Kullanıcı siparişleri alınırken hata:", error.message);
        res.status(500).json({ message: "Server hatası", error: error.message });
    }
};
