import React, { useEffect, useMemo, useState } from 'react'
import { supabase, isSupabaseConfigured, ownerEmail } from './supabase.js'
import { money, whatsappUrl } from './format.js'
import { Menu, ShoppingBag, Search, Plus, Minus, Trash2, Settings, LogIn, LogOut, Package, QrCode, ExternalLink, Eye, EyeOff, Save, X, Instagram, Facebook, Coffee, Utensils, ChevronDown } from 'lucide-react'

const demoCategories = [
  { id: 'hot', name: 'مشروبات ساخنة', sort_order: 1, is_visible: true },
  { id: 'cold', name: 'مشروبات باردة', sort_order: 2, is_visible: true },
  { id: 'food', name: 'الوجبات الرئيسية', sort_order: 3, is_visible: true },
  { id: 'dessert', name: 'الحلويات', sort_order: 4, is_visible: true }
]
const demoProducts = [
  { id: 'p1', category_id: 'hot', name: 'قهوة عربية', description: 'قهوة عربية بالهيل', price: 2.5, image_url: '', is_available: true, is_featured: true },
  { id: 'p2', category_id: 'cold', name: 'عصير برتقال طازج', description: 'عصير طبيعي 100%', price: 3.5, image_url: '', is_available: true },
  { id: 'p3', category_id: 'food', name: 'برغر المطعم', description: 'لحم مشوي وخضار طازجة', price: 9.5, image_url: '', is_available: true, is_featured: true },
  { id: 'p4', category_id: 'dessert', name: 'تشيز كيك', description: 'قطعة تشيز كيك كريمية', price: 4.5, image_url: '', is_available: true }
]
const initialSettings = {
  restaurant_name: 'مطعم MenuGo', tagline: 'أهلاً وسهلاً بكم', currency: 'EUR',
  whatsapp_enabled: false, whatsapp_number: '', internal_orders_enabled: false,
  facebook_enabled: false, facebook_url: '', instagram_enabled: false, instagram_url: '',
  primary_color: '#1d4738', logo_url: '', cover_url: ''
}
const emptyProduct = { name: '', name_ar: '', name_en: '', description: '', description_ar: '', description_en: '', price: '', category_id: '', image_url: '', is_available: true, is_featured: false }
let menuViewRecordedForPageLoad = false

export default function App() {
  const [settings, setSettings] = useState(initialSettings)
  const [lang, setLang] = useState(() => localStorage.getItem('menugo_lang') || 'ar')
  const [categoryDraftAr, setCategoryDraftAr] = useState('')
  const [categoryDraftEn, setCategoryDraftEn] = useState('')
  const [orders, setOrders] = useState([])
  const [reviews, setReviews] = useState([])
  const [reviewDraft, setReviewDraft] = useState({ product: null, rating: 5, comment: '' })
  const [uploading, setUploading] = useState(false)
  const [categories, setCategories] = useState(demoCategories)
  const [products, setProducts] = useState(demoProducts)
  const [cart, setCart] = useState([])
  const [activeCategory, setActiveCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(() => new URLSearchParams(window.location.search).get('admin') === '1' ? 'admin' : 'menu')
  const [session, setSession] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState('')
  const [productDraft, setProductDraft] = useState(emptyProduct)
  const [categoryDraft, setCategoryDraft] = useState('')
  const [editingProduct, setEditingProduct] = useState(null)
  const [editingCategory, setEditingCategory] = useState(null)
  const [orderNote, setOrderNote] = useState('')
  const [qrData, setQrData] = useState('')
  const [qrImage, setQrImage] = useState('')
  const [analytics, setAnalytics] = useState(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)

  const text = (ar, en) => lang === 'ar' ? ar : en
  const localized = (item, base) => lang === 'ar'
    ? (item?.[`${base}_ar`] || item?.[base] || item?.[`${base}_en`] || '')
    : (item?.[`${base}_en`] || item?.[base] || item?.[`${base}_ar`] || '')
  useEffect(() => {
    localStorage.setItem('menugo_lang', lang)
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
  }, [lang])

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true) })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); setAuthReady(true) })
    return () => listener.subscription.unsubscribe()
  }, [])

  // هوية عشوائية محلية لتمييز الزائر الفريد دون تخزين اسمه أو بريده أو عنوان IP.
  useEffect(() => {
    if (!supabase || !authReady || menuViewRecordedForPageLoad) return
    const isOwner = Boolean(session?.user?.email && ownerEmail && session.user.email.toLowerCase() === ownerEmail)
    if (isOwner) return
    menuViewRecordedForPageLoad = true
    let visitorId = localStorage.getItem('menugo_visitor_id')
    if (!visitorId) {
      visitorId = crypto.randomUUID()
      localStorage.setItem('menugo_visitor_id', visitorId)
    }
    const requestedSource = new URLSearchParams(window.location.search).get('source')
    const source = requestedSource === 'qr' ? 'qr' : 'direct'
    supabase.from('analytics_events').insert({ event_type: 'menu_view', source, visitor_id: visitorId }).then(({ error }) => {
      if (error) console.warn('تعذر تسجيل زيارة المينيو:', error.message)
    })
  }, [session, authReady])

  useEffect(() => {
    if (!supabase || page !== 'admin' || !allowedOwner) return
    loadAnalytics()
    loadOrders()
    loadReviews()
  }, [page, session, lang, products])

  const trackProductView = (productId) => {
    if (!supabase) return
    const isOwner = Boolean(session?.user?.email && ownerEmail && session.user.email.toLowerCase() === ownerEmail)
    if (isOwner) return
    const visitorId = localStorage.getItem('menugo_visitor_id') || crypto.randomUUID()
    localStorage.setItem('menugo_visitor_id', visitorId)
    const source = new URLSearchParams(window.location.search).get('source') === 'qr' ? 'qr' : 'direct'
    supabase.from('analytics_events').insert({ event_type: 'product_view', product_id: productId, source, visitor_id: visitorId }).then(({ error }) => {
      if (error) console.warn('تعذر تسجيل مشاهدة المنتج:', error.message)
    })
  }

  const loadOrders = async () => {
    if (!supabase || !allowedOwner) return
    const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(200)
    if (error) return notify(`تعذر تحميل الطلبات: ${error.message}`)
    setOrders(data || [])
  }
  const loadReviews = async () => {
    if (!supabase || !allowedOwner) return
    const { data, error } = await supabase.rpc('get_product_review_summary')
    if (error) return notify(`تعذر تحميل التقييمات: ${error.message}`)
    setReviews(data || [])
  }
  const changeOrderStatus = async (id, status) => {
    const { error } = await supabase.from('orders').update({ status }).eq('id', id)
    if (error) return notify(error.message)
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o))
  }
  const uploadImage = async (file, onUploaded) => {
    if (!supabase || !allowedOwner) return notify('يلزم تسجيل دخول المدير وتهيئة Supabase')
    if (!file || !['image/jpeg','image/png','image/webp'].includes(file.type)) return notify('اختر صورة JPG أو PNG أو WebP')
    if (file.size > 5 * 1024 * 1024) return notify('الحد الأقصى لحجم الصورة 5MB')
    setUploading(true)
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
    const path = `${Date.now()}-${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage.from('menugo-assets').upload(path, file, { upsert: false, contentType: file.type })
    setUploading(false)
    if (error) return notify(`فشل رفع الصورة: ${error.message}`)
    const { data } = supabase.storage.from('menugo-assets').getPublicUrl(path)
    onUploaded(data.publicUrl)
    notify('تم رفع الصورة بنجاح')
  }
  const submitReview = async () => {
    if (!reviewDraft.product || !supabase) return
    let visitorId = localStorage.getItem('menugo_visitor_id')
    if (!visitorId) { visitorId = crypto.randomUUID(); localStorage.setItem('menugo_visitor_id', visitorId) }
    const { error } = await supabase.from('product_reviews').insert({
      product_id: reviewDraft.product.id, rating: Number(reviewDraft.rating),
      comment: reviewDraft.comment.trim() || null, visitor_id: visitorId
    })
    if (error) return notify(error.code === '23505' ? 'سبق أن قيّمت هذا المنتج من هذا الجهاز' : `تعذر حفظ التقييم: ${error.message}`)
    setReviewDraft({ product: null, rating: 5, comment: '' })
    notify('شكراً لك، تم استلام تقييمك')
  }

  const loadAnalytics = async () => {
    if (!supabase) return
    setAnalyticsLoading(true)
    const { data, error } = await supabase.rpc('get_menu_analytics')
    setAnalyticsLoading(false)
    if (error) return notify(`تعذر تحميل الإحصائيات: ${error.message}`)
    const stats = data || {}
    const daily = (stats.daily || []).map(item => ({
      label: new Date(`${item.day}T12:00:00`).toLocaleDateString(lang === 'ar' ? 'ar' : 'en', { weekday: 'short', day: 'numeric' }),
      visits: Number(item.visits || 0)
    }))
    const topProducts = (stats.top_products || []).map(item => ({
      name: products.find(p => p.id === item.product_id) ? localized(products.find(p => p.id === item.product_id), 'name') : text('منتج محذوف', 'Deleted product'),
      views: Number(item.views || 0)
    }))
    setAnalytics({
      visitors: Number(stats.visitors || 0), visits: Number(stats.visits || 0),
      qrVisitors: Number(stats.qr_visitors || 0), qrScans: Number(stats.qr_scans || 0),
      directVisits: Number(stats.direct_visits || 0), productViews: Number(stats.product_views || 0),
      daily, topProducts
    })
  }

  useEffect(() => {
    if (!supabase) return
    let alive = true
    ;(async () => {
      const [s, c, p] = await Promise.all([
        supabase.from('restaurant_settings').select('*').eq('id', 1).maybeSingle(),
        supabase.from('categories').select('*').order('sort_order'),
        supabase.from('products').select('*').order('created_at', { ascending: false })
      ])
      if (!alive) return
      if (s.data) setSettings({ ...initialSettings, ...s.data })
      if (c.data?.length) setCategories(c.data)
      if (p.data) setProducts(p.data)
    })()
    return () => { alive = false }
  }, [session])

  const userProviders = session?.user?.app_metadata?.providers || []
  const isGoogleUser = session?.user?.app_metadata?.provider === 'google' || userProviders.includes('google')
  const allowedOwner = Boolean(session?.user?.email && session.user.email.toLowerCase() === ownerEmail && session.user.email_confirmed_at && isGoogleUser)
  const isAdminEntry = new URLSearchParams(window.location.search).get('admin') === '1'
  const visibleCategories = categories.filter(c => c.is_visible !== false && c.is_published !== false).sort((a,b) => a.sort_order-b.sort_order)
  const shownProducts = useMemo(() => products.filter(p =>
    p.is_available !== false && p.is_published !== false &&
    (activeCategory === 'all' || p.category_id === activeCategory) &&
    (`${localized(p,'name')} ${localized(p,'description')}`).toLowerCase().includes(search.toLowerCase())
  ), [products, activeCategory, search, lang])
  const total = cart.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0)
  const count = cart.reduce((sum, item) => sum + item.quantity, 0)

  const notify = (msg) => { setNotice(msg); window.setTimeout(() => setNotice(''), 3200) }
  const updateSetting = (key, value) => setSettings(prev => ({ ...prev, [key]: value }))
  const addToCart = (product) => setCart(prev => {
    const found = prev.find(x => x.id === product.id)
    return found ? prev.map(x => x.id === product.id ? { ...x, quantity: x.quantity + 1 } : x) : [...prev, { ...product, quantity: 1 }]
  })
  const changeQty = (id, delta) => setCart(prev => prev.map(x => x.id === id ? { ...x, quantity: x.quantity + delta } : x).filter(x => x.quantity > 0))
  const saveSettings = async () => {
    if (!supabase) return notify('أضف إعدادات Supabase في ملف .env أولاً')
    const { error } = await supabase.from('restaurant_settings').upsert({ ...settings, id: 1 })
    notify(error ? `تعذر الحفظ: ${error.message}` : 'تم حفظ إعدادات المطعم')
  }
  const moveCategory = async (id, delta) => {
    const sorted = [...categories].sort((a,b)=>a.sort_order-b.sort_order)
    const index = sorted.findIndex(c=>c.id===id), target = index + delta
    if (target < 0 || target >= sorted.length) return
    const a = sorted[index], b = sorted[target]
    if (supabase) {
      const first = await supabase.from('categories').update({sort_order:b.sort_order}).eq('id',a.id)
      if (first.error) return notify(first.error.message)
      const second = await supabase.from('categories').update({sort_order:a.sort_order}).eq('id',b.id)
      if (second.error) return notify(second.error.message)
      const {data,error}=await supabase.from('categories').select('*').order('sort_order')
      if(error)return notify(error.message)
      setCategories(data||[])
    } else {
      setCategories(sorted.map((c,i)=>i===index?{...c,sort_order:b.sort_order}:i===target?{...c,sort_order:a.sort_order}:c))
    }
  }
  const saveCategory = async () => {
    const name = categoryDraftAr.trim() || categoryDraftEn.trim()
    if (!categoryDraftAr.trim() || !categoryDraftEn.trim()) return notify('أدخل اسم القسم بالعربية والإنجليزية')
    const payload = { name, name_ar: categoryDraftAr.trim(), name_en: categoryDraftEn.trim(), sort_order: categories.length + 1, is_visible: true, is_published: true }
    if (supabase) {
      const query = editingCategory
        ? supabase.from('categories').update({ name, name_ar: categoryDraftAr.trim(), name_en: categoryDraftEn.trim() }).eq('id', editingCategory)
        : supabase.from('categories').insert(payload)
      const { error } = await query
      if (error) return notify(error.message)
      const { data } = await supabase.from('categories').select('*').order('sort_order')
      if (data) setCategories(data)
    } else if (editingCategory) setCategories(prev => prev.map(c => c.id === editingCategory ? { ...c, ...payload } : c))
    else setCategories(prev => [...prev, { ...payload, id: crypto.randomUUID() }])
    setCategoryDraft(''); setCategoryDraftAr(''); setCategoryDraftEn(''); setEditingCategory(null); notify('تم حفظ القسم')
  }
  const deleteCategory = async (id) => {
    if (!window.confirm('هل تريد حذف هذا القسم؟')) return
    if (supabase) {
      const { error } = await supabase.from('categories').delete().eq('id', id)
      if (error) return notify(error.message)
    }
    setCategories(prev => prev.filter(c => c.id !== id)); setProducts(prev => prev.filter(p => p.category_id !== id))
    notify('تم حذف القسم')
  }
  const saveProduct = async () => {
    if (!(productDraft.name_ar.trim() || productDraft.name_en.trim()) || !productDraft.category_id || productDraft.price === '') return notify('أكمل اسم المنتج والقسم والسعر')
    const payload = { ...productDraft, name: productDraft.name_ar || productDraft.name_en, description: productDraft.description_ar || productDraft.description_en, price: Number(productDraft.price), is_published: true }
    if (supabase) {
      const query = editingProduct
        ? supabase.from('products').update(payload).eq('id', editingProduct)
        : supabase.from('products').insert(payload)
      const { error } = await query
      if (error) return notify(error.message)
      const { data } = await supabase.from('products').select('*').order('created_at', { ascending: false })
      if (data) setProducts(data)
    } else if (editingProduct) setProducts(prev => prev.map(p => p.id === editingProduct ? { ...p, ...payload } : p))
    else setProducts(prev => [{ ...payload, id: crypto.randomUUID() }, ...prev])
    setProductDraft(emptyProduct); setEditingProduct(null); notify('تم حفظ المنتج')
  }
  const deleteProduct = async (id) => {
    if (!window.confirm('هل تريد حذف المنتج؟')) return
    if (supabase) {
      const { error } = await supabase.from('products').delete().eq('id', id)
      if (error) return notify(error.message)
    }
    setProducts(prev => prev.filter(p => p.id !== id)); notify('تم حذف المنتج')
  }
  const sendWhatsApp = () => {
    if (!settings.whatsapp_enabled) return notify('الطلب عبر واتساب غير متاح حالياً')
    if (!cart.length) return notify('السلة فارغة')
    const lines = cart.map(x => `• ${x.name} × ${x.quantity} — ${money(x.price*x.quantity, settings.currency)}`).join('\\n')
    const message = `طلب جديد من ${settings.restaurant_name}\\n${lines}\\nالإجمالي: ${money(total, settings.currency)}\\nملاحظات: ${orderNote || 'لا يوجد'}`
    const url = whatsappUrl(settings.whatsapp_number, message)
    if (!url) return notify('أضف رقم واتساب صحيحاً من إعدادات المطعم')
    window.open(url, '_blank', 'noopener,noreferrer')
  }
  const submitInternalOrder = async () => {
    if (!settings.internal_orders_enabled) return notify('الطلبات الداخلية غير مفعلة')
    if (!cart.length) return notify('السلة فارغة')
    if (!supabase) return notify('يلزم ربط Supabase لتسجيل الطلب داخلياً')
    let visitorId = localStorage.getItem('menugo_visitor_id')
    if (!visitorId) { visitorId = crypto.randomUUID(); localStorage.setItem('menugo_visitor_id', visitorId) }
    const { error } = await supabase.from('orders').insert({
      visitor_id: visitorId,
      items: cart.map(({id,name,price,quantity}) => ({ product_id:id, name, price, quantity })),
      total, notes: orderNote, status: 'new'
    })
    if (error) return notify(`تعذر تسجيل الطلب: ${error.message}`)
    setCart([]); setOrderNote(''); notify('تم إرسال الطلب بنجاح')
  }
  const login = async () => {
    if (!supabase) return notify('أضف إعدادات Supabase أولاً')
    if (!ownerEmail) return notify('حدد VITE_OWNER_EMAIL في ملف .env')
    const basePath = import.meta.env.BASE_URL || '/'
    const redirectTo = `${window.location.origin}${basePath}?admin=1`
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })
    if (error) notify(error.message)
  }
  const logout = async () => { await supabase?.auth.signOut(); window.history.replaceState({}, '', import.meta.env.BASE_URL || '/'); setPage('menu') }
  const makeQr = async () => {
    const baseUrl = import.meta.env.VITE_PUBLIC_MENU_URL || new URL(import.meta.env.BASE_URL || '/', window.location.origin).toString()
    const qrUrl = new URL(baseUrl, window.location.origin)
    qrUrl.searchParams.set('source', 'qr')
    const url = qrUrl.toString()
    setQrData(url)
    try {
      const QRCode = (await import('qrcode')).default
      setQrImage(await QRCode.toDataURL(url, { width: 480, margin: 2 }))
    } catch { notify('تعذر إنشاء QR') }
  }

  return <div className="app-shell" style={{'--brand': settings.primary_color || '#1d4738'}}>
    <header className="topbar">
      <button className="icon-btn mobile-menu" onClick={() => setPage('menu')} aria-label="القائمة"><Menu/></button>
      <div className="brand"><div className="brand-mark">{settings.logo_url?<img src={settings.logo_url} alt="logo"/>:<Utensils size={20}/>}</div><div><strong>{lang === 'ar' ? settings.restaurant_name : (settings.restaurant_name_en || settings.restaurant_name)}</strong><small>{text('القائمة الإلكترونية','Digital menu')}</small></div></div>
      <button className="outline-btn lang-toggle" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}>{lang === 'ar' ? 'English' : 'العربية'}</button><nav className="top-nav">
        <button className={page==='menu'?'active':''} onClick={()=>setPage('menu')}>المينيو</button>
        <button className={page==='cart'?'active':''} onClick={()=>setPage('cart')}>السلة <span className="count">{count}</span></button>

      </nav>
      <button className="cart-top" onClick={()=>setPage('cart')}><ShoppingBag size={18}/><span>{count}</span></button>
    </header>

    {page==='menu' && <>
      <section className="hero">
        <div className="hero-copy"><span className="eyebrow">MENU • FRESH • DELICIOUS</span><h1>{settings.tagline || 'نكهات تستحق التجربة'}</h1><p>تصفح قائمتنا واختر ما يناسب ذوقك.</p><button className="primary-btn" onClick={()=>document.getElementById('menu-list')?.scrollIntoView({behavior:'smooth'})}>استكشف القائمة <ChevronDown size={17}/></button></div>
        <div className="hero-art"><div className="plate"><Coffee size={86}/></div><span className="art-leaf leaf-one">✦</span><span className="art-leaf leaf-two">✧</span></div>
      </section>
      <main id="menu-list" className="content">
        <div className="section-heading"><div><span className="eyebrow">OUR MENU</span><h2>قائمتنا</h2><p>اختر من أشهى الأصناف المحضرة بعناية</p></div><label className="search-box"><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="ابحث عن طبق أو مشروب..."/></label></div>
        <div className="category-tabs"><button className={activeCategory==='all'?'selected':''} onClick={()=>setActiveCategory('all')}>الكل</button>{visibleCategories.map(c=><button key={c.id} className={activeCategory===c.id?'selected':''} onClick={()=>setActiveCategory(c.id)}>{localized(c,'name')}</button>)}</div>
        <div className="product-grid">{shownProducts.map(p=><article className="product-card" key={p.id} onClick={()=>trackProductView(p.id)}><div className="product-image">{p.image_url?<img src={p.image_url} alt={p.name}/>:<div className="food-placeholder"><Utensils size={34}/></div>}{p.is_featured&&<span className="featured">اختيار مميز</span>}</div><div className="product-info"><div><h3>{localized(p,'name')}</h3><p>{localized(p,'description')}</p></div><div className="product-bottom"><strong>{money(p.price,settings.currency)}</strong><button className="add-btn" onClick={()=>addToCart(p)} aria-label="أضف إلى السلة"><Plus size={18}/></button></div><button className="tiny-btn review-trigger" onClick={e=>{e.stopPropagation();setReviewDraft({product:p,rating:5,comment:''})}}>{text('قيّم هذا المنتج','Rate this item')}</button></div></article>)}</div>
        {!shownProducts.length&&<div className="empty-state">لا توجد منتجات مطابقة حالياً.</div>}
      </main>
      <footer className="footer"><div><strong>{settings.restaurant_name}</strong><p>نسعد بخدمتكم دائماً</p></div><div className="socials">
        {settings.facebook_enabled&&settings.facebook_url&&<a href={settings.facebook_url} target="_blank" rel="noreferrer" aria-label="Facebook"><Facebook/></a>}
        {settings.instagram_enabled&&settings.instagram_url&&<a href={settings.instagram_url} target="_blank" rel="noreferrer" aria-label="Instagram"><Instagram/></a>}
      </div><small>Powered by MenuGo</small></footer>
    </>}

    {page==='cart'&&<main className="content narrow"><div className="section-heading"><div><span className="eyebrow">YOUR ORDER</span><h2>سلة الطلبات</h2><p>راجع طلبك قبل الإرسال</p></div><button className="outline-btn" onClick={()=>setPage('menu')}>العودة للقائمة</button></div>
      {!cart.length?<div className="empty-state"><ShoppingBag size={38}/><h3>سلتك فارغة</h3><p>أضف بعض الأصناف اللذيذة من القائمة.</p><button className="primary-btn" onClick={()=>setPage('menu')}>تصفح المينيو</button></div>:<div className="cart-layout"><section className="cart-items">{cart.map(item=><div className="cart-row" key={item.id}><div className="cart-thumb"><Utensils/></div><div className="cart-desc"><strong>{item.name}</strong><small>{money(item.price,settings.currency)} للقطعة</small></div><div className="qty"><button onClick={()=>changeQty(item.id,-1)}><Minus size={14}/></button><b>{item.quantity}</b><button onClick={()=>changeQty(item.id,1)}><Plus size={14}/></button></div><strong>{money(item.price*item.quantity,settings.currency)}</strong><button className="remove-btn" onClick={()=>changeQty(item.id,-item.quantity)}><Trash2 size={17}/></button></div>)}
      <label className="field-label">ملاحظات على الطلب<textarea value={orderNote} onChange={e=>setOrderNote(e.target.value)} placeholder="مثلاً: بدون بصل، أو صوص إضافي..."/></label></section><aside className="summary"><h3>ملخص الطلب</h3><div><span>عدد الأصناف</span><b>{count}</b></div><div className="grand-total"><span>الإجمالي</span><strong>{money(total,settings.currency)}</strong></div>
      {settings.whatsapp_enabled&&<button className="whatsapp-btn" onClick={sendWhatsApp}>إرسال الطلب عبر واتساب</button>}
      {settings.internal_orders_enabled&&<button className="primary-btn full" onClick={submitInternalOrder}>تأكيد الطلب</button>}
      {!settings.whatsapp_enabled&&!settings.internal_orders_enabled&&<p className="muted">طرق الطلب غير مفعلة حالياً. يرجى التواصل مع المطعم.</p>}</aside></div>}
    </main>}

    {page==='admin'&&isAdminEntry&&<main className="content admin-content">{!allowedOwner?<div className="empty-state"><LogIn size={38}/><h2>دخول صاحب المطعم</h2><p>تسجيل الدخول متاح لحساب Google المحدد لهذه النسخة فقط.</p><button className="primary-btn" onClick={login}><LogIn size={17}/> الدخول باستخدام Google</button></div>:<>
      <div className="section-heading"><div><span className="eyebrow">CONTROL PANEL</span><h2>لوحة إدارة المطعم</h2><p>إدارة قائمتك وإعدادات المطعم من مكان واحد</p></div><button className="outline-btn" onClick={logout}><LogOut size={16}/> تسجيل الخروج</button></div>
      <div className="admin-tabs"><button className="selected" onClick={()=>document.getElementById('settings-panel')?.scrollIntoView({behavior:'smooth'})}><Settings size={16}/> الإعدادات</button><button onClick={()=>document.getElementById('categories-panel')?.scrollIntoView({behavior:'smooth'})}>الأقسام</button><button onClick={()=>document.getElementById('products-panel')?.scrollIntoView({behavior:'smooth'})}>المنتجات</button><button onClick={()=>document.getElementById('orders-panel')?.scrollIntoView({behavior:'smooth'})}>الطلبات</button><button onClick={()=>document.getElementById('reviews-panel')?.scrollIntoView({behavior:'smooth'})}>التقييمات</button><button onClick={()=>document.getElementById('qr-panel')?.scrollIntoView({behavior:'smooth'})}><QrCode size={16}/> QR</button><button onClick={()=>document.getElementById('analytics-panel')?.scrollIntoView({behavior:'smooth'})}><Eye size={16}/> الإحصائيات</button></div>
      <section id="analytics-panel" className="admin-panel analytics-panel"><div className="panel-title"><Eye/><div><h3>إحصائيات الزوار</h3><p>آخر 30 يوماً — تُحدّث عند فتح لوحة الإدارة</p></div><button className="outline-btn" onClick={loadAnalytics}>تحديث</button></div>
        {analyticsLoading?<p className="muted">جارٍ تحميل الإحصائيات...</p>:analytics?<>
          <div className="analytics-cards">
            <div className="analytics-card"><small>الزوار الفريدون</small><strong>{analytics.visitors}</strong></div>
            <div className="analytics-card"><small>زيارات المينيو</small><strong>{analytics.visits}</strong></div>
            <div className="analytics-card"><small>زوار QR الفريدون</small><strong>{analytics.qrVisitors}</strong></div>
            <div className="analytics-card"><small>مرات فتح QR</small><strong>{analytics.qrScans}</strong></div>
            <div className="analytics-card"><small>زيارات الرابط المباشر</small><strong>{analytics.directVisits}</strong></div>
            <div className="analytics-card"><small>مشاهدات المنتجات</small><strong>{analytics.productViews}</strong></div>
          </div>
          <h4>الزيارات خلال آخر 7 أيام</h4><div className="daily-stats">{analytics.daily.map(day=><div className="daily-stat" key={day.label}><span>{day.label}</span><b>{day.visits}</b><div className="daily-bar"><i style={{width:`${Math.max(4, day.visits / Math.max(1,...analytics.daily.map(x=>x.visits))*100)}%`}}/></div></div>)}</div>
          <h4>أكثر المنتجات مشاهدة</h4>{analytics.topProducts.length?analytics.topProducts.map((p,i)=><div className="manage-row" key={`${p.name}-${i}`}><span>{p.name}</span><b>{p.views} مشاهدة</b></div>):<p className="muted">لا توجد مشاهدات منتجات مسجلة بعد.</p>}
          <p className="muted analytics-note">يُحتسب الزائر الفريد بواسطة معرّف عشوائي محفوظ على جهازه، ولا نسجل الاسم أو البريد أو عنوان IP. قد يتغير العدد إذا حذف الزائر بيانات المتصفح أو استخدم جهازاً آخر.</p>
        </>:<p className="muted">لا توجد بيانات بعد. ستظهر الإحصائيات بعد بدء استقبال الزيارات.</p>}
      </section>
      <section id="settings-panel" className="admin-panel"><div className="panel-title"><Settings/><div><h3>إعدادات المطعم والتواصل</h3><p>هذه الإعدادات تخص نسخة هذا المطعم فقط.</p></div></div>
        <div className="form-grid"><label>اسم المطعم<input value={settings.restaurant_name} onChange={e=>updateSetting('restaurant_name',e.target.value)}/></label><label>اسم المطعم بالإنجليزية<input value={settings.restaurant_name_en||''} onChange={e=>updateSetting('restaurant_name_en',e.target.value)}/></label><label>عبارة ترحيبية<input value={settings.tagline||''} onChange={e=>updateSetting('tagline',e.target.value)}/></label><label>Welcome tagline (English)<input value={settings.tagline_en||''} onChange={e=>updateSetting('tagline_en',e.target.value)}/></label><label>العملة<select value={settings.currency||'EUR'} onChange={e=>updateSetting('currency',e.target.value)}><option value="EUR">يورو EUR</option><option value="USD">دولار USD</option><option value="TRY">ليرة تركية TRY</option><option value="SAR">ريال سعودي SAR</option><option value="SYP">ليرة سورية SYP</option></select></label><label>لون الهوية<input type="color" value={settings.primary_color||'#1d4738'} onChange={e=>updateSetting('primary_color',e.target.value)}/></label></div>
        <div className="form-grid"><label>شعار المطعم<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>uploadImage(e.target.files?.[0],url=>updateSetting('logo_url',url))}/>{settings.logo_url&&<img className="admin-image-preview" src={settings.logo_url} alt="شعار المطعم"/>}</label><label>صورة الغلاف<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>uploadImage(e.target.files?.[0],url=>updateSetting('cover_url',url))}/>{settings.cover_url&&<img className="admin-image-preview" src={settings.cover_url} alt="غلاف المطعم"/>}</label></div>
        <div className="setting-row"><div><b>الطلب عبر واتساب</b><small>إظهار أو إخفاء زر الطلب عبر واتساب للزبائن</small></div><input type="checkbox" checked={!!settings.whatsapp_enabled} onChange={e=>updateSetting('whatsapp_enabled',e.target.checked)}/></div>
        {settings.whatsapp_enabled&&<label className="single-field">رقم واتساب مع رمز الدولة<input value={settings.whatsapp_number||''} onChange={e=>updateSetting('whatsapp_number',e.target.value)} placeholder="مثال: 33612345678"/></label>}
        <div className="setting-row"><div><b>استقبال الطلبات داخل النظام</b><small>حفظ الطلبات في قاعدة البيانات لمتابعة حالتها</small></div><input type="checkbox" checked={!!settings.internal_orders_enabled} onChange={e=>updateSetting('internal_orders_enabled',e.target.checked)}/></div>
        <div className="social-setting"><div className="social-heading"><Facebook/><b>فيسبوك</b><input type="checkbox" checked={!!settings.facebook_enabled} onChange={e=>updateSetting('facebook_enabled',e.target.checked)}/></div>{settings.facebook_enabled&&<input value={settings.facebook_url||''} onChange={e=>updateSetting('facebook_url',e.target.value)} placeholder="رابط صفحة فيسبوك"/>}</div>
        <div className="social-setting"><div className="social-heading"><Instagram/><b>إنستغرام</b><input type="checkbox" checked={!!settings.instagram_enabled} onChange={e=>updateSetting('instagram_enabled',e.target.checked)}/></div>{settings.instagram_enabled&&<input value={settings.instagram_url||''} onChange={e=>updateSetting('instagram_url',e.target.value)} placeholder="رابط حساب إنستغرام"/>}</div>
        <button className="primary-btn" onClick={saveSettings}><Save size={17}/> حفظ الإعدادات</button>
      </section>
      <section id="categories-panel" className="admin-panel"><div className="panel-title"><Package/><div><h3>إدارة الأقسام</h3><p>أضف أقساماً غير محددة العدد ورتبها حسب قائمتك.</p></div></div><div className="inline-form"><input value={categoryDraftAr} onChange={e=>setCategoryDraftAr(e.target.value)} placeholder="اسم القسم بالعربية"/><input value={categoryDraftEn} onChange={e=>setCategoryDraftEn(e.target.value)} placeholder="Category name in English"/><button className="primary-btn" onClick={saveCategory}>{editingCategory?'تحديث القسم':'إضافة قسم'}</button>{editingCategory&&<button className="outline-btn" onClick={()=>{setEditingCategory(null);setCategoryDraft('');setCategoryDraftAr('');setCategoryDraftEn('')}}>إلغاء</button>}</div>
        {categories.map(c=><div className="manage-row" key={c.id}><span>{c.name_ar || c.name} / {c.name_en || c.name}</span><button className="tiny-btn" onClick={()=>{setEditingCategory(c.id);setCategoryDraftAr(c.name_ar || c.name);setCategoryDraftEn(c.name_en || c.name)}}>تعديل</button><button className="tiny-btn" onClick={()=>moveCategory(c.id,-1)} title="تحريك لأعلى">↑</button><button className="tiny-btn" onClick={()=>moveCategory(c.id,1)} title="تحريك لأسفل">↓</button><button className="tiny-btn danger" onClick={()=>deleteCategory(c.id)}>حذف</button><button className="tiny-btn" onClick={async()=>{const v=!c.is_visible;if(supabase){const {error}=await supabase.from('categories').update({is_visible:v}).eq('id',c.id);if(error)return notify(error.message)}setCategories(prev=>prev.map(x=>x.id===c.id?{...x,is_visible:v}:x))}}>{c.is_visible===false?<EyeOff size={15}/>:<Eye size={15}/>}</button></div>)}
      </section>
      <section id="products-panel" className="admin-panel"><div className="panel-title"><Utensils/><div><h3>إدارة المنتجات</h3><p>إضافة المنتجات وتعديل الأسعار والتوفر والصور.</p></div></div>
        <div className="form-grid"><label>اسم المنتج بالعربية<input value={productDraft.name_ar} onChange={e=>setProductDraft({...productDraft,name_ar:e.target.value})}/></label><label>Product name (English)<input value={productDraft.name_en} onChange={e=>setProductDraft({...productDraft,name_en:e.target.value})}/></label><label>السعر<input type="number" min="0" step="0.01" value={productDraft.price} onChange={e=>setProductDraft({...productDraft,price:e.target.value})}/></label><label>القسم<select value={productDraft.category_id} onChange={e=>setProductDraft({...productDraft,category_id:e.target.value})}><option value="">اختر القسم</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name_ar || c.name} / {c.name_en || c.name}</option>)}</select></label><label>صورة المنتج<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>uploadImage(e.target.files?.[0],url=>setProductDraft(prev=>({...prev,image_url:url})))}/>{productDraft.image_url&&<img className="admin-image-preview" src={productDraft.image_url} alt="معاينة"/>}{uploading&&<small>جارٍ رفع الصورة...</small>}</label><label>الوصف بالعربية<textarea value={productDraft.description_ar} onChange={e=>setProductDraft({...productDraft,description_ar:e.target.value})}/></label><label>Description (English)<textarea value={productDraft.description_en} onChange={e=>setProductDraft({...productDraft,description_en:e.target.value})}/></label></div>
        <div className="check-line"><label><input type="checkbox" checked={!!productDraft.is_available} onChange={e=>setProductDraft({...productDraft,is_available:e.target.checked})}/> متوفر</label><label><input type="checkbox" checked={!!productDraft.is_featured} onChange={e=>setProductDraft({...productDraft,is_featured:e.target.checked})}/> منتج مميز</label></div>
        <button className="primary-btn" onClick={saveProduct}>{editingProduct?'تحديث المنتج':'إضافة المنتج'}</button>
        {products.map(p=><div className="manage-row" key={p.id}><span><b>{p.name_ar || p.name} / {p.name_en || p.name}</b><small>{money(p.price,settings.currency)}</small></span><button className="tiny-btn" onClick={()=>{setEditingProduct(p.id);setProductDraft({...emptyProduct,...p,name_ar:p.name_ar||p.name,name_en:p.name_en||p.name,description_ar:p.description_ar||p.description,description_en:p.description_en||p.description,price:String(p.price)})}}>تعديل</button><button className="tiny-btn" onClick={async()=>{const v=p.is_published===false;const {error}=await supabase.from('products').update({is_published:v}).eq('id',p.id);if(error)return notify(error.message);setProducts(prev=>prev.map(x=>x.id===p.id?{...x,is_published:v}:x))}}>{p.is_published===false?<EyeOff size={15}/>:<Eye size={15}/>}</button><button className="tiny-btn danger" onClick={()=>deleteProduct(p.id)}>حذف</button></div>)}
      </section>
      <section id="orders-panel" className="admin-panel"><div className="panel-title"><Package/><div><h3>إدارة الطلبات</h3><p>متابعة الطلبات الداخلية وتحديث حالتها</p></div><button className="outline-btn" onClick={loadOrders}>تحديث</button></div>
        {orders.length ? orders.map(order=><article className="order-card" key={order.id}><div className="manage-row"><b>طلب #{order.order_number || order.id.slice(0,8)}</b><small>{new Date(order.created_at).toLocaleString('ar')}</small></div><p>{(order.items||[]).map(i=>`${i.name} × ${i.quantity} (${money(i.price*i.quantity,settings.currency)})`).join('، ')}</p><p><b>الإجمالي:</b> {money(order.total,settings.currency)} {order.notes&&<> · {order.notes}</>}</p><label>حالة الطلب<select value={order.status} onChange={e=>changeOrderStatus(order.id,e.target.value)}>{[['new','جديد'],['preparing','قيد التحضير'],['ready','جاهز'],['completed','مكتمل'],['cancelled','ملغي']].map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></label></article>) : <p className="muted">لا توجد طلبات داخلية حتى الآن.</p>}
      </section>
      <section id="reviews-panel" className="admin-panel"><div className="panel-title"><Eye/><div><h3>تقييمات المنتجات (خاصة بالمدير)</h3><p>لا تظهر التقييمات أو متوسطاتها للزوار</p></div><button className="outline-btn" onClick={loadReviews}>تحديث</button></div>
        {reviews.map(r=><article className="order-card" key={r.product_id}><h4>{products.find(p=>p.id===r.product_id)?.name_ar || products.find(p=>p.id===r.product_id)?.name || 'منتج'}</h4><b>★ {r.average_rating} / 5 · {r.review_count} تقييم</b>{(r.reviews||[]).map(item=><p key={item.id}>{'★'.repeat(item.rating)} {item.comment || 'دون تعليق'} <small>{new Date(item.created_at).toLocaleString('ar')}</small></p>)}</article>)}
        {!reviews.length&&<p className="muted">لا توجد تقييمات بعد.</p>}
      </section>
      <section id="qr-panel" className="admin-panel"><div className="panel-title"><QrCode/><div><h3>رمز QR الخاص بالمينيو</h3><p>أنشئ رمزاً يفتح رابط القائمة مباشرة.</p></div></div><button className="primary-btn" onClick={makeQr}>إنشاء رمز QR</button>{qrImage&&<div className="qr-result"><img src={qrImage} alt="QR Code"/><code>{qrData}</code><a className="outline-btn" href={qrImage} download="menugo-qr.png">تنزيل PNG</a><button className="outline-btn" onClick={()=>window.print()}>طباعة</button></div>}</section>
      <section className="admin-panel"><h3>معلومات الربط</h3><p className="muted">{isSupabaseConfigured?'تم العثور على إعدادات Supabase في البيئة.':'لم يتم ضبط Supabase بعد؛ الواجهة تعمل ببيانات تجريبية محلية.'}</p></section>
    </>}</main>}

    {reviewDraft.product&&<div className="review-backdrop"><section className="review-dialog"><button className="remove-btn" onClick={()=>setReviewDraft({product:null,rating:5,comment:''})}><X/></button><h3>{text('تقييم المنتج','Rate product')}: {localized(reviewDraft.product,'name')}</h3><label>{text('التقييم بالنجوم','Star rating')}<select value={reviewDraft.rating} onChange={e=>setReviewDraft({...reviewDraft,rating:e.target.value})}>{[5,4,3,2,1].map(n=><option key={n} value={n}>{'★'.repeat(n)} ({n})</option>)}</select></label><label>{text('تعليق اختياري','Optional comment')}<textarea maxLength={1000} value={reviewDraft.comment} onChange={e=>setReviewDraft({...reviewDraft,comment:e.target.value})}/></label><button className="primary-btn" onClick={submitReview}>{text('إرسال التقييم','Submit review')}</button></section></div>}
    {notice&&<div className="toast">{notice}</div>}
    {page==='menu'&&cart.length>0&&<button className="floating-cart" onClick={()=>setPage('cart')}><ShoppingBag/> عرض السلة <b>{count}</b><strong>{money(total,settings.currency)}</strong></button>}
  </div>
}