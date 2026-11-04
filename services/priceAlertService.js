import ProductEngagement from "../models/productEngagementSchema.js";
import Notification from "../models/notificationSchema.js";
import { calculateProductPricing } from "./orderPricingService.js";
import { getIO } from "../utils/socket.js";
import { USER } from "../utils/role.js";

const MAX_ALERTS_PER_RUN = 500;

// Same pricing rules the checkout uses, so an alert can never fire at a price the
// customer would not actually be charged.
const getEffectivePrice = (product) => {
  try {
    return calculateProductPricing(product).unitPrice;
  } catch {
    return null;
  }
};

const notifyPriceDrops = async (product) => {
  if (!product?._id) return 0;
  const price = getEffectivePrice(product);
  if (price === null) return 0;

  const candidates = await ProductEngagement.find({
    product: product._id,
    type: "price-alert",
    triggeredAt: null,
    targetPrice: { $gte: price },
  })
    .select("_id user")
    .limit(MAX_ALERTS_PER_RUN)
    .lean();

  let delivered = 0;
  for (const alert of candidates) {
    // Claim the alert first. If two requests race (an admin edit and the customer
    // creating the alert), only the winner proceeds, so nobody is notified twice.
    const claimed = await ProductEngagement.findOneAndUpdate(
      { _id: alert._id, triggeredAt: null },
      { $set: { triggeredAt: new Date() } },
    ).select("_id");
    if (!claimed) continue;

    try {
      const notification = await Notification.create({
        user: alert.user,
        recipient: alert.user,
        recipientRole: USER,
        type: "PRICE_DROP",
        title: "Price drop alert",
        titleAr: "تنبيه انخفاض السعر",
        message: `${product.name} is now ${price}`,
        messageAr: `انخفض سعر ${product.nameAr || product.name} إلى ${price}`,
      });
      delivered += 1;
      try {
        getIO().to(`user:${alert.user}`).emit("notification", notification);
      } catch {
        // Socket delivery is best-effort; the notification is already persisted.
      }
    } catch (error) {
      // Give the alert back so a later price change can try again.
      await ProductEngagement.updateOne({ _id: alert._id }, { $set: { triggeredAt: null } });
      console.error("Price alert notification failed:", error.message);
    }
  }
  return delivered;
};

export { getEffectivePrice, notifyPriceDrops };
