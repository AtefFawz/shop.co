# إعدادات الأمان المطلوبة بعد التحديث (Backend)

1. استخدم Node.js 22.13 أو أحدث من الإصدارات المدعومة. ملف `.nvmrc` يحدد 22، و`.npmrc` يرفض التشغيل على إصدار أقدم من شرط `engines`.
2. نفّذ `npm install` مرة واحدة لإنشاء `package-lock.json` جديد مطابق لإصدارات `package.json` الآمنة (Multer 2.5.0+ وExpress 5.3.x وMongoose 9.11.4+ وSocket.IO 4.8.4)، ثم احفظ ملف القفل في Git. احذفنا القفل القديم لأنه كان يثبت Multer بإصدار متأثر؛ لا تستخدم `npm ci` قبل إنشاء القفل الجديد.
3. شغّل `npm audit` وراجع كل finding؛ لا تستخدم `npm audit fix --force` دون اختبار التوافق.
4. في الإنتاج اضبط `CLIENT_URL` و`CORS_ORIGINS` على origins الفعلية فقط، و`TRUST_PROXY_HOPS` حسب عدد reverse proxies الحقيقي. لا تضع قيمة افتراضية عشوائية خلف CDN/Load Balancer.
5. شغّل `npm run db:backfill-products` مرة واحدة بعد النشر لإنشاء TTL indexes لجدولي `rate_limit_buckets` و`socket_tickets` وكذلك فهارس البحث الحالية. لا تحذف هذين الجدولين يدويًا أثناء التشغيل.
6. الـ rate limits الحساسة وتعديلات الإدارة والطلبات والمراجعات والإشعارات تستخدم MongoDB مشتركًا؛ في حال تعذر MongoDB يتم رفض الطلب بـ 503 بدل الرجوع إلى ذاكرة كل instance. حدّ الطلبات العام داخل الذاكرة حماية burst إضافية فقط وليس بديلًا عن WAF/Rate Limiting على مستوى منصة الاستضافة.
7. اجعل `SECRET_ACCESS_KEY` و`REFRESH_SECRET` عشوائيين مختلفين، بطول 32 حرفًا على الأقل. دوّر المفاتيح عند الاشتباه بالتسريب؛ التدوير سيخرج جميع المستخدمين.
8. Google OAuth يحتاج عنوان callback HTTPS مطابقًا في Google Console. لا تغيّر تدفق `client_state` / `code` / `state` دون الحفاظ على ربط nonce بمتصفح المستخدم.

## سلوك الجلسات

- Access وRefresh tokens تُرسل داخل HttpOnly cookies، ولا يعاد access token في JSON.
- تسجيل الدخول الجديد يبطل الجلسة السابقة للحساب ذريًا؛ هذا سلوك جلسة واحدة نشطة لكل حساب، وطلبات تسجيل الدخول المتزامنة لا يمكنها إعادة إحياء الجلسة الأقدم.
- طلبات المتصفح غير الآمنة تتطلب Origin موثوقًا. أضف كل نطاق إنتاج فعلي إلى `CLIENT_URL` / `CORS_ORIGINS`.
- Socket.IO يتطلب ticket قصير العمر، لمرة واحدة، يُصدره `/api/auth/socket-ticket`.
