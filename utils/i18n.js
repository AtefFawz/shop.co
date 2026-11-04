const translations = new Map([
  ["All fields are required", "جميع الحقول مطلوبة"],
  ["Email and password are required", "البريد الإلكتروني وكلمة المرور مطلوبان"],
  ["Invalid email or password", "البريد الإلكتروني أو كلمة المرور غير صحيحة"],
  ["Password is too weak.", "كلمة المرور ضعيفة. استخدم كلمة مرور أقوى."],
  ["Email already registered.", "هذا البريد الإلكتروني مسجل بالفعل."],
  ["Token is required", "رمز الدخول مطلوب"],
  ["Invalid Authorization Format", "صيغة Authorization غير صحيحة"],
  ["Invalid Token", "رمز الدخول غير صالح أو انتهت صلاحيته"],
  ["Access Denied: You do not have the required permissions", "ليس لديك الصلاحيات المطلوبة لتنفيذ هذا الإجراء"],
  ["Route not found", "المسار المطلوب غير موجود"],
  ["Internal Server Error", "حدث خطأ داخلي في الخادم"],
  ["Database Connection Error", "حدث خطأ أثناء الاتصال بقاعدة البيانات"],
  ["No refresh token provided", "لم يتم إرسال رمز تحديث الجلسة"],
  ["Invalid refresh token", "رمز تحديث الجلسة غير صالح"],
  ["Invalid or expired refresh token", "رمز تحديث الجلسة غير صالح أو انتهت صلاحيته"],
  ["Logged out successfully", "تم تسجيل الخروج بنجاح"],
  ["Password has been reset successfully", "تم تغيير كلمة المرور بنجاح"],
  ["Password reset OTP has been sent to your email", "تم إرسال رمز إعادة تعيين كلمة المرور إلى بريدك الإلكتروني"],
  ["OTP verified successfully", "تم التحقق من رمز التأكيد بنجاح"],
  ["Email and OTP are required", "البريد الإلكتروني ورمز التأكيد مطلوبان"],
  ["Email, OTP, and new password are required", "البريد الإلكتروني ورمز التأكيد وكلمة المرور الجديدة مطلوبة"],
  ["Authentication failed, please login again", "فشل التحقق من الهوية، يرجى تسجيل الدخول مرة أخرى"],
  ["Unauthorized: Please login first", "غير مصرح. يرجى تسجيل الدخول أولاً"],
  ["User not found", "المستخدم غير موجود"],
  ["This product was not found", "المنتج غير موجود"],
  ["Product photo is required", "صورة المنتج مطلوبة"],
  ["Invalid product ID", "معرّف المنتج غير صالح"],
  ["Invalid order ID", "معرّف الطلب غير صالح"],
  ["Order not found", "الطلب غير موجود"],
  ["No order items provided", "لم تتم إضافة منتجات إلى الطلب"],
  ["Shipping address is required", "عنوان الشحن مطلوب"],
  ["Invalid status value", "حالة الطلب غير صالحة"],
  ["Invalid sort value", "قيمة الترتيب غير صالحة"],
  ["Invalid keyword value", "قيمة البحث غير صالحة"],
  ["minPrice cannot be greater than maxPrice", "يجب ألا يكون الحد الأدنى للسعر أكبر من الحد الأقصى"],
  ["Notification not found", "الإشعار غير موجود"],
  ["Invalid notification ID", "معرّف الإشعار غير صالح"],
  ["Review not found or you are not authorized to delete it", "التقييم غير موجود أو ليس لديك صلاحية حذفه"],
  ["Please provide all required fields", "يرجى إدخال جميع البيانات المطلوبة"],
  ["Product with this ID does not exist", "المنتج بهذا المعرّف غير موجود"],
  ["You have already reviewed this product", "لقد أضفت تقييمًا لهذا المنتج من قبل"],
  ["Product is out of stock or requested quantity is unavailable", "المنتج غير متوفر أو الكمية المطلوبة أكبر من المخزون"],
  ["Invalid request payload", "بيانات الطلب غير صالحة"],
  ["Too many requests. Please try again later.", "عدد الطلبات كبير جدًا. يرجى المحاولة لاحقًا."],
  ["File must be a supported image (JPEG, PNG, or WebP)", "يجب أن يكون الملف صورة مدعومة (JPEG أو PNG أو WebP)"],
  ["Uploaded file is too large", "حجم الملف المرفوع أكبر من المسموح"],
  ["User authentication failed", "فشل التحقق من هوية المستخدم"],
  ["User not authenticated", "المستخدم غير مسجل الدخول"],
  ["Valid email is required", "يرجى إدخال بريد إلكتروني صحيح"],
  ["Failed to send email. Please try again.", "تعذر إرسال البريد الإلكتروني. يرجى المحاولة مرة أخرى."],
  ["Google authentication failed", "فشل تسجيل الدخول باستخدام Google"],
  ["Invalid or expired Google authorization code", "رمز تفويض Google غير صالح أو انتهت صلاحيته"],
  ["Invalid Google OAuth state", "طلب تسجيل الدخول باستخدام Google غير صالح أو منتهي الصلاحية"],
  ["CLIENT_URL is not configured", "لم يتم ضبط رابط الواجهة الأمامية في إعدادات الخادم"],
  ["No valid fields provided for update", "لم يتم إرسال أي بيانات صالحة للتحديث"],
  ["Invalid review ID", "معرّف التقييم غير صالح"],
  ["Invalid role value", "قيمة الصلاحية غير صالحة"],
  ["Invalid user ID format", "صيغة معرّف المستخدم غير صالحة"],
  ["Forbidden: You cannot delete your own admin account", "لا يمكنك حذف حساب المدير الخاص بك"],
  ["Only Admins can modify Admin accounts", "المدير الأعلى فقط يمكنه تعديل حسابات المديرين"],
  ["Managers/Admins cannot update their own role", "لا يمكن للمدير أو مدير النظام تعديل صلاحية حسابه بنفسه"],
  ["Only pending orders can be deleted by customers", "يمكن للعميل حذف الطلبات التي ما زالت قيد الانتظار فقط"],
  ["Order status was changed by another request", "تم تغيير حالة الطلب بواسطة طلب آخر"],
  ["Invalid product price", "سعر المنتج غير صالح"],
  ["Invalid product discount", "نسبة خصم المنتج غير صالحة"],
  ["This product was not found", "المنتج غير موجود"],
  ["Product with this ID does not exist", "المنتج بهذا المعرّف غير موجود"],
  ["You are not authorized to view this order", "ليس لديك صلاحية لعرض هذا الطلب"],
  ["Review deleted successfully", "تم حذف التقييم بنجاح"],
  ["User deleted successfully", "تم حذف المستخدم بنجاح"],
  ["User role updated successfully", "تم تحديث صلاحية المستخدم بنجاح"],
  ["Order deleted successfully", "تم حذف الطلب بنجاح"],
  ["Profile updated successfully", "تم تحديث الملف الشخصي بنجاح"],
  ["Product, its media assets, and associated reviews deleted successfully", "تم حذف المنتج وصوره والتقييمات المرتبطة به بنجاح"],
  ["Cannot change order status from Pending to Shipped", "لا يمكن تغيير حالة الطلب من قيد الانتظار إلى تم الشحن"],
  ["JWT secrets must be different", "يجب أن يكون مفتاحا JWT مختلفين عن بعضهما"],
  ["Shipped or delivered orders are kept for records and cannot be deleted", "الطلبات المشحونة أو المسلّمة محفوظة كسجل ولا يمكن حذفها"],
  ["Card payments are not available yet", "الدفع بالبطاقة غير متاح حاليًا"],
  ["Invalid Idempotency-Key header", "قيمة Idempotency-Key غير صالحة"],
  ["Please verify your email before signing in", "يرجى تأكيد بريدك الإلكتروني قبل تسجيل الدخول"],
  ["Invalid or expired verification code", "رمز التحقق غير صحيح أو منتهي الصلاحية"],
  ["Email and 6-digit code are required", "البريد الإلكتروني والرمز المكوّن من 6 أرقام مطلوبان"],
  ["Valid email is required", "يرجى إدخال بريد إلكتروني صحيح"],
  ["Verification code sent to your email", "أرسلنا رمز التحقق إلى بريدك الإلكتروني"],
  ["If this email is awaiting verification, a new code has been sent", "إذا كان هذا البريد ينتظر التأكيد، فقد أرسلنا رمزًا جديدًا"],
  ["Please wait a minute before requesting another verification code.", "يرجى الانتظار دقيقة قبل طلب رمز تحقق جديد."],
  ["Account created but the verification email could not be sent. Please request a new code.", "تم إنشاء الحساب لكن تعذر إرسال رسالة التحقق. يرجى طلب رمز جديد."],
  ["You can only review products you have purchased and received", "يمكنك تقييم المنتجات التي اشتريتها واستلمتها فقط"],
  ["Stock changed while you were editing. Reload and try again.", "تغيّر المخزون أثناء التعديل. أعد تحميل المنتج وحاول مرة أخرى."],
  ["This resource already exists.", "هذا العنصر موجود بالفعل."],
]);

const localeFrom = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized.startsWith("ar") ? "ar" : "en";
};

const translate = (message, locale = "en") => {
  if (locale !== "ar" || typeof message !== "string") return message;
  if (translations.has(message)) return translations.get(message);

  const dynamicRules = [
    [/^Product with ID (.+) not found$/, "المنتج ذو المعرّف $1 غير موجود"],
    [/^Please wait (\d+) minute\(s\) before requesting a new code\.$/, "يرجى الانتظار $1 دقيقة قبل طلب رمز جديد."],
    [/^Your order status has been changed to (.+)$/, "تم تغيير حالة طلبك إلى $1"],
    [/^New Order From User: (.+)$/, "طلب جديد من المستخدم: $1"],
    [/^Maximum daily OTP limit reached\. Try again tomorrow\.$/, "تم الوصول إلى الحد اليومي لطلبات رمز التأكيد. حاول غدًا."],
    [/^OTP has expired\. Please request a new code\.$/, "انتهت صلاحية رمز التأكيد. يرجى طلب رمز جديد."],
    [/^Too many failed attempts\. Please request a new OTP\.$/, "تجاوزت عدد المحاولات المسموح. يرجى طلب رمز تأكيد جديد."],
    [/^Invalid OTP code\.$/, "رمز التأكيد غير صحيح."],
    [/^You can keep at most (\d+) saved products$/, "الحد الأقصى للمنتجات المحفوظة هو $1"],
    [/^You can keep at most (\d+) price alerts$/, "الحد الأقصى لتنبيهات الأسعار هو $1"],
    [/^Invalid (.+) value$/, "قيمة $1 غير صالحة"],
    [/^Invalid (.+) format$/, "صيغة $1 غير صالحة"],
    [/^(.+) must be true or false$/, "يجب أن تكون قيمة $1 صحيحة أو خاطئة"],
    [/^(.+) must be an array or comma-separated string$/, "يجب أن تكون قيمة $1 مصفوفة أو نصًا مفصولًا بفواصل"],
    [/^(.+) must be configured with at least 32 characters$/, "يجب ضبط $1 بطول 32 حرفًا على الأقل"],
    [/^Cannot change order status from (.+) to (.+)$/, "لا يمكن تغيير حالة الطلب من $1 إلى $2"],
    [/^Selected (size|color) is not available for this product$/, "قيمة المقاس أو اللون المحددة غير متاحة لهذا المنتج"],
    [/^Invalid (gender|section|style|category) filter$/, "قيمة فلتر $1 غير صالحة"],
    [/^Product deleted; some remote images could not be removed$/, "تم حذف المنتج، لكن تعذر حذف بعض الصور من التخزين السحابي"],
  ];

  for (const [pattern, replacement] of dynamicRules) {
    if (pattern.test(message)) return message.replace(pattern, replacement);
  }
  return message;
};

const localizeDocument = (document, locale) => {
  if (!document || typeof document !== "object") return document;
  if (Array.isArray(document)) {
    return document.map((item) => localizeDocument(item, locale));
  }

  const localized = { ...document };
  if (locale === "ar") {
    for (const field of ["name", "description", "category", "section", "style", "gender"]) {
      const arabicValue = localized[`${field}Ar`];
      const englishValue = localized[`${field}En`];
      if (arabicValue || englishValue) localized[field] = arabicValue || localized[field] || englishValue;
    }
    if (localized.nameAr || localized.nameEn || localized.descriptionAr || localized.descriptionEn) {
      localized.localized = {
        ...(localized.localized || {}),
        name: localized.name,
        description: localized.description,
        locale,
      };
    }
  } else {
    for (const field of ["name", "description", "category", "section", "style", "gender"]) {
      const englishValue = localized[`${field}En`];
      if (englishValue) localized[field] = englishValue;
    }
    if (localized.nameEn || localized.descriptionEn) {
      localized.localized = {
        ...(localized.localized || {}),
        name: localized.name,
        description: localized.description,
        locale,
      };
    }
  }
  return localized;
};

export { localeFrom, translate, localizeDocument };
