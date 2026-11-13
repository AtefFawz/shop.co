// Builds the customer-facing invoice from a stored order. Money is summed in
// integer cents so floating point never shows up as 0.30000000000000004.
const toCents = (value) => Math.round((Number(value) || 0) * 100);

const buildInvoice = (order) => {
  const items = Array.isArray(order.orderItems) ? order.orderItems : [];
  const subtotalCents = items.reduce(
    (sum, item) => sum + toCents(item.price) * (Number(item.quantity) || 0),
    0,
  );

  return {
    number: `SHOP-${String(order._id).slice(-8).toUpperCase()}`,
    issuedAt: order.createdAt,
    customer: order.user,
    shippingAddress: order.shippingAddress,
    items,
    subtotal: subtotalCents / 100,
    shippingFee: order.shippingFee,
    total: order.totalPrice,
    currency: "EGP",
    paymentMethod: order.paymentMethod,
    paymentStatus: order.isPaid ? "Paid" : "Unpaid",
    orderStatus: order.status,
  };
};

export { buildInvoice };
