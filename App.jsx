import React, { useEffect, useMemo, useRef, useState } from 'react'
import { supabase, ownerEmail } from './supabase.js'
import { money, whatsappUrl } from './format.js'
import { Menu, ShoppingCart, Search, Plus, Minus, Trash2, SlidersHorizontal, LogIn, LogOut, Tags, ClipboardList, QrCode, Eye, EyeOff, Save, X, Instagram, Facebook, MapPinned, Coffee, UtensilsCrossed, ChevronDown, CheckCircle2, AlertCircle, ShieldAlert, Store, Star, Sparkles, ArrowUp, ArrowDown, Bell, BellRing } from 'lucide-react'

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
  restaurant_name: 'مطعم MenuGo', tagline: 'أهلاً وسهلاً بكم', currency: 'SYP',
  whatsapp_enabled: false, whatsapp_number: '', internal_orders_enabled: false,
  order_sound_enabled: false, order_status_enabled: true,
  facebook_enabled: false, facebook_url: '', instagram_enabled: false, instagram_url: '',
  restaurant_address: '', restaurant_location_url: '', restaurant_latitude: '', restaurant_longitude: '',
  primary_color: '#1d4738', logo_url: '', cover_url: ''
}
const emptyProduct = { name: '', name_ar: '', description: '', description_ar: '', price: '', category_id: '', image_url: '', is_available: true, is_featured: false }

// تجهيز الصور محلياً قبل رفعها إلى Supabase Storage.
const optimizeImageForUpload = async (file) => {
  let bitmap
  let objectUrl
  try {
    if (typeof createImageBitmap === 'function') {
      bitmap = await createImageBitmap(file)
    } else {
      objectUrl = URL.createObjectURL(file)
      bitmap = await new Promise((resolve, reject) => {
        const image = new Image()
        image.onload = () => resolve(image)
        image.onerror = () => reject(new Error('تعذر قراءة الصورة'))
        image.src = objectUrl
      })
    }

    const maxDimension = 1600
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('تعذر تجهيز الصورة للضغط')
    context.drawImage(bitmap, 0, 0, width, height)

    const compressedBlob = await new Promise((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('تعذر تحويل الصورة إلى WebP')), 'image/webp', 0.88)
    })
    return compressedBlob
  } finally {
    if (bitmap && typeof bitmap.close === 'function') bitmap.close()
    if (objectUrl) URL.revokeObjectURL(objectUrl)
  }
}

const arabicValue = (value) => {
  const result = String(value || '').trim()
  return /[\u0600-\u06FF]/.test(result) ? result : ''
}
const categoryLabel = (category) => arabicValue(category?.name_ar) || arabicValue(category?.name)
const isUuid = (value) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)

const validCoordinates = (latValue, lonValue) => {
  const lat = Number(latValue)
  const lon = Number(lonValue)
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null
  return { lat, lon }
}

const coordinatesFromMapLink = (value) => {
  const raw = String(value || '').trim()
  if (!raw) return null
  let decoded = raw
  try { decoded = decodeURIComponent(raw) } catch { /* inspect the original URL */ }
  const patterns = [
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/i,
    /@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/i,
    /[?&](?:q|query|destination|ll|center)=(-?\d+(?:\.\d+)?)(?:,|%2c)(-?\d+(?:\.\d+)?)/i,
    /^\s*(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})\s*$/
  ]
  for (const pattern of patterns) {
    const match = decoded.match(pattern)
    if (match) {
      const coordinates = validCoordinates(match[1], match[2])
      if (coordinates) return coordinates
    }
  }
  return null
}

const restaurantCoordinates = (settings) => {
  const rawLat = settings?.restaurant_latitude
  const rawLon = settings?.restaurant_longitude
  if (rawLat !== '' && rawLat != null && rawLon !== '' && rawLon != null) {
    const coordinates = validCoordinates(rawLat, rawLon)
    if (coordinates) return coordinates
  }
  return coordinatesFromMapLink(settings?.restaurant_location_url)
}

const restaurantMapUrl = (settings) => {
  const coordinates = restaurantCoordinates(settings)
  if (coordinates) {
    return `https://www.google.com/maps/search/?api=1&query=${coordinates.lat},${coordinates.lon}`
  }
  const raw = String(settings?.restaurant_location_url || '').trim()
  if (raw) {
    try {
      const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
      const parsed = new URL(candidate)
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return parsed.toString()
    } catch { /* use the saved address as a Maps search */ }
  }
  const address = String(settings?.restaurant_address || '').trim()
  return address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : ''
}
let menuViewRecordedForPageLoad = false
const MENU_POSITION_KEY = 'menugo_menu_position_v1'
const readSavedMenuPosition = () => {
  try { return JSON.parse(sessionStorage.getItem(MENU_POSITION_KEY) || 'null') }
  catch { return null }
}

export default function App() {
  const [settings, setSettings] = useState(initialSettings)
  const [categoryDraftAr, setCategoryDraftAr] = useState('')
  const [orders, setOrders] = useState([])
  const [myOrders, setMyOrders] = useState([])
  const [myOrdersLoading, setMyOrdersLoading] = useState(false)
  const [orderDashboardStats, setOrderDashboardStats] = useState(null)
  const [reviews, setReviews] = useState([])
  const [reviewsNotificationDismissed, setReviewsNotificationDismissed] = useState(false)
  const [ordersNotificationDismissed, setOrdersNotificationDismissed] = useState(false)
  const [reviewDraft, setReviewDraft] = useState({ product: null, rating: 5, comment: '' })
  const [uploading, setUploading] = useState(false)
  const [categories, setCategories] = useState(() => supabase ? [] : demoCategories)
  const [products, setProducts] = useState(() => supabase ? [] : demoProducts)
  const [cart, setCart] = useState([])
  const [activeCategory, setActiveCategory] = useState(() => readSavedMenuPosition()?.activeCategory || 'all')
  const [search, setSearch] = useState(() => readSavedMenuPosition()?.search || '')
  const [menuDataReady, setMenuDataReady] = useState(!supabase)
  const menuRestoreApplied = useRef(false)
  const [page, setPage] = useState(() => new URLSearchParams(window.location.search).get('admin') === '1' ? 'admin' : 'menu')
  const [activeAdminSection, setActiveAdminSection] = useState('analytics')
  const [settingsTab, setSettingsTab] = useState('restaurant')
  const [updatingOrderId, setUpdatingOrderId] = useState(null)
  const [updatingProductId, setUpdatingProductId] = useState(null)
  const [updatingProductPublishId, setUpdatingProductPublishId] = useState(null)
  const [savingSettings, setSavingSettings] = useState(false)
  const [savingProduct, setSavingProduct] = useState(false)
  const [savingCategory, setSavingCategory] = useState(false)
  const productActionLocks = useRef(new Set())
  const orderSubmitLock = useRef(false)
  const [session, setSession] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState('')
  const [noticeKind, setNoticeKind] = useState('success')
  const [confirmDialog, setConfirmDialog] = useState(null)
  const [confirmBusy, setConfirmBusy] = useState(false)
  const [productDraft, setProductDraft] = useState(emptyProduct)
  const [editingProduct, setEditingProduct] = useState(null)
  const [editingCategory, setEditingCategory] = useState(null)
  const [orderNote, setOrderNote] = useState('')
  const [qrData, setQrData] = useState('')
  const [qrImage, setQrImage] = useState('')
  const [restaurantTables, setRestaurantTables] = useState([])
  const [tableDraft, setTableDraft] = useState('')
  const [tableQrImages, setTableQrImages] = useState({})
  const [activeRestaurantTable, setActiveRestaurantTable] = useState(null)
  const [activeQrIsGeneral, setActiveQrIsGeneral] = useState(false)
  const [tableLoading, setTableLoading] = useState(false)
  const [analytics, setAnalytics] = useState(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [distanceLoading, setDistanceLoading] = useState(false)
  const [distanceInfo, setDistanceInfo] = useState(null)
  const seenOrderIdsRef = useRef(null)

  const localized = (item, base) => arabicValue(item?.[`${base}_ar`]) || arabicValue(item?.[base])

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true) })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); setAuthReady(true) })
    return () => listener.subscription.unsubscribe()
  }, [])

  // ربط رمز QR بالطاولة تلقائياً من قاعدة البيانات.
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('table')
    if (!token || !supabase) return
    supabase.rpc('menugo_get_table_by_token', { p_token: token }).then(({ data, error }) => {
      if (error || !data) { notify('رمز الطاولة غير صالح أو لم يعد متاحاً'); return }
      setActiveQrIsGeneral(Boolean(data.is_general))
      setActiveRestaurantTable(data.is_general ? null : data)
    })
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
    loadOrderDashboardStats()
    loadReviews()
    loadRestaurantTables()
  }, [page, session, products])

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

  const loadMyOrders = async () => {
    if (!supabase) return notify('متابعة الطلبات تتطلب اتصالاً بقاعدة البيانات')
    let visitorId = localStorage.getItem('menugo_visitor_id')
    if (!visitorId) { setMyOrders([]); return }
    setMyOrdersLoading(true)
    try {
      const { data, error } = await supabase.rpc('menugo_get_visitor_orders', { p_visitor_id: visitorId })
      if (error) { notify(`تعذر تحميل طلباتك: ${error.message}`, 'error'); return }
      setMyOrders(data || [])
    } catch (error) {
      notify('تعذر الاتصال لعرض طلباتك. تحقق من الإنترنت وحاول مجدداً.', 'error')
    } finally { setMyOrdersLoading(false) }
  }
  const openMyOrders = () => { setPage('my-orders'); loadMyOrders() }

  // Refresh customer tracking periodically so an order disappears shortly after
  // its 24-hour server-side visibility window expires, even if the page stays open.
  useEffect(() => {
    if (page !== 'my-orders' || !supabase) return
    const refreshVisibleOrders = () => {
      if (document.visibilityState === 'visible') loadMyOrders()
    }
    const interval = window.setInterval(refreshVisibleOrders, 60000)
    document.addEventListener('visibilitychange', refreshVisibleOrders)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', refreshVisibleOrders)
    }
  }, [page, session])

  const loadOrders = async () => {
    if (!supabase || !allowedOwner) return
    const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(200)
    if (error) return notify(`تعذر تحميل الطلبات: ${error.message}`)
    setOrders(data || [])
    seenOrderIdsRef.current = new Set((data || []).map(order => order.id))
  }

  // إحصائيات مستقلة عن قائمة آخر 200 طلب، مع احترام اليوم حسب توقيت جهاز مدير المطعم.
  const loadOrderDashboardStats = async ({ silent = false } = {}) => {
    if (!supabase || !allowedOwner) return
    const dayStart = new Date()
    dayStart.setHours(0, 0, 0, 0)
    const nextDay = new Date(dayStart)
    nextDay.setDate(nextDay.getDate() + 1)
    const startIso = dayStart.toISOString()
    const endIso = nextDay.toISOString()
    try {
      let todayOrdersCount = 0
      let todayRevenueCents = 0
      let offset = 0
      const pageSize = 1000
      while (true) {
        const { data, count, error } = await supabase
          .from('orders')
          .select('id,total,status,created_at', { count: offset === 0 ? 'exact' : undefined })
          .gte('created_at', startIso)
          .lt('created_at', endIso)
          .order('created_at', { ascending: true })
          .range(offset, offset + pageSize - 1)
        if (error) throw error
        const rows = data || []
        if (offset === 0 && Number.isFinite(count)) todayOrdersCount = count
        for (const order of rows) {
          if (order.status !== 'cancelled') todayRevenueCents += Math.round(Number(order.total || 0) * 100)
        }
        if (rows.length < pageSize) {
          if (!Number.isFinite(count)) todayOrdersCount = offset + rows.length
          break
        }
        offset += pageSize
      }
      const { count: newOrdersCount, error: newOrdersError } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'new')
      if (newOrdersError) throw newOrdersError
      setOrderDashboardStats({ todayOrders: todayOrdersCount, todayRevenue: todayRevenueCents / 100, newOrdersCount: newOrdersCount || 0 })
    } catch (error) {
      if (!silent) notify(`تعذر تحديث إحصائيات الطلبات: ${error.message || 'خطأ في الاتصال'}`, 'error')
      return false
    }
    return true
  }
  const playNewOrderSound = () => {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext
      if (!AudioContextClass) return
      const context = new AudioContextClass()
      const notes = [784, 988, 1175, 1568]
      const noteGap = 0.17
      notes.forEach((frequency, index) => {
        const startAt = context.currentTime + index * noteGap
        const oscillator = context.createOscillator()
        const gain = context.createGain()
        oscillator.type = 'triangle'
        oscillator.frequency.setValueAtTime(frequency, startAt)
        gain.gain.setValueAtTime(0.0001, startAt)
        gain.gain.exponentialRampToValueAtTime(0.28, startAt + 0.018)
        gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.145)
        oscillator.connect(gain)
        gain.connect(context.destination)
        oscillator.start(startAt)
        oscillator.stop(startAt + 0.16)
        if (index === notes.length - 1) oscillator.onended = () => context.close()
      })
    } catch (error) {
      console.warn('تعذر تشغيل تنبيه الطلب:', error)
    }
  }

  // فحص الطلبات الجديدة دورياً حتى يعمل التنبيه حتى دون إعداد Realtime في قاعدة البيانات.
  useEffect(() => {
    if (!supabase || page !== 'admin' || !allowedOwner) return
    let active = true
    const checkForNewOrders = async () => {
      const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(200)
      if (!active || error) return
      const nextOrders = data || []
      const nextIds = new Set(nextOrders.map(order => order.id))
      if (seenOrderIdsRef.current) {
        const hasNewOrder = nextOrders.some(order => !seenOrderIdsRef.current.has(order.id))
        if (hasNewOrder) setOrdersNotificationDismissed(false)
        if (hasNewOrder && settings.order_sound_enabled) playNewOrderSound()
      }
      seenOrderIdsRef.current = nextIds
      setOrders(nextOrders)
    }
    const interval = window.setInterval(checkForNewOrders, 8000)
    return () => { active = false; window.clearInterval(interval) }
  }, [page, session, settings.order_sound_enabled])

  useEffect(() => {
    if (!supabase || page !== 'admin' || !allowedOwner) return
    const interval = window.setInterval(() => loadOrderDashboardStats({ silent: true }), 30000)
    return () => window.clearInterval(interval)
  }, [page, session])

  const loadRestaurantTables = async () => {
    if (!supabase || !allowedOwner) return
    setTableLoading(true)
    const { data, error } = await supabase.from('restaurant_tables').select('*').order('is_general', { ascending: false }).order('created_at')
    setTableLoading(false)
    if (error) return notify(`تعذر تحميل رموز الطاولات: ${error.message}`)
    setRestaurantTables(data || [])
    const QRCode = (await import('qrcode')).default
    const baseUrl = import.meta.env.VITE_PUBLIC_MENU_URL || new URL(import.meta.env.BASE_URL || '/', window.location.origin).toString()
    const images = {}
    for (const table of (data || [])) {
      const url = new URL(baseUrl, window.location.origin)
      url.searchParams.set('source', 'qr')
      url.searchParams.set('table', table.qr_token)
      images[table.id] = await QRCode.toDataURL(url.toString(), { width: 420, margin: 2 })
    }
    setTableQrImages(images)
  }
  const addRestaurantTable = async () => {
    const name = tableDraft.trim()
    if (!name) return notify('أدخل اسم الطاولة')
    const { error } = await supabase.from('restaurant_tables').insert({ table_name: name })
    if (error) return notify(`تعذر إضافة الطاولة: ${error.message}`)
    setTableDraft('')
    await loadRestaurantTables()
    notify('تمت إضافة الطاولة ورمزها الثابت')
  }
  const deleteRestaurantTable = async (table) => {
    if (!isUuid(table?.id)) { notify('تعذر حذف الطاولة: معرّف الطاولة غير صالح.', 'error'); return false }
    const { error } = await supabase.from('restaurant_tables').delete().eq('id', table.id)
    if (error) { notify(`تعذر حذف الطاولة: ${error.message}`, 'error'); return false }
    await loadRestaurantTables()
    notify('تم حذف الطاولة')
    return true
  }
  const printTableQr = (table) => {
    const image = tableQrImages[table.id]
    if (!image) return notify('رمز QR غير جاهز للطباعة')
    const popup = window.open('', '_blank', 'width=600,height=700')
    if (!popup) return notify('اسمح بفتح النوافذ المنبثقة للطباعة')
    popup.document.write(`<html lang="ar" dir="rtl"><head><title>رمز الطاولة</title><style>body{font-family:Tahoma,Arial,sans-serif;text-align:center;padding:30px}img{width:320px;max-width:90%}</style></head><body><h2>${String(table.table_name).replace(/[&<>"]/g, '')}</h2><img src="${image}"/><script>window.onload=()=>window.print()<\/script></body></html>`)
    popup.document.close()
  }
  const loadReviews = async () => {
    if (!supabase || !allowedOwner) return
    const { data, error } = await supabase.rpc('get_product_review_summary')
    if (error) return notify(`تعذر تحميل التقييمات: ${error.message}`)
    setReviews(data || [])
  }
  const changeOrderStatus = async (id, status) => {
    if (updatingOrderId) return false
    if (supabase && typeof navigator !== 'undefined' && navigator.onLine === false) {
      notify('لا يوجد اتصال بالإنترنت. أعد الاتصال قبل تحديث حالة الطلب.', 'error')
      return false
    }
    setUpdatingOrderId(id)
    try {
      const currentOrder = orders.find(order => order.id === id)
      if (currentOrder?.status === 'cancelled' && status !== 'cancelled') {
        notify('هذا الطلب ملغى نهائياً ولا يمكن تأكيده أو إعادة تفعيله.', 'error')
        return false
      }
      if (supabase) {
        if (!isUuid(id)) { notify('تعذر تحديث الطلب: معرّف الطلب غير صالح.', 'error'); return false }
        // شرط قاعدة البيانات يمنع تحديث طلب أُلغي بالفعل حتى لو كانت الواجهة قديمة.
        const { data, error } = await supabase.from('orders').update({ status }).eq('id', id).neq('status', 'cancelled').select('id,status').maybeSingle()
        if (error) { notify(saveFailureMessage(error, 'تحديث حالة الطلب'), 'error'); return false }
        if (!data) {
          await loadOrders()
          notify('هذا الطلب ملغى نهائياً ولا يمكن تأكيده أو إعادة تفعيله.', 'error')
          return false
        }
      }
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o))
      notify(`تم تحديث حالة الطلب إلى ${orderStatusLabel(status)}`)
      if (supabase) loadOrderDashboardStats({ silent: true })
      return true
    } catch (error) {
      notify(saveFailureMessage(error, 'تحديث حالة الطلب'), 'error')
      return false
    } finally { setUpdatingOrderId(null) }
  }
  const toggleProductAvailability = async (product) => {
    if (!product?.id || productActionLocks.current.size > 0 || updatingProductId || updatingProductPublishId) return
    productActionLocks.current.add(product.id)
    const nextValue = product.is_available === false
    setUpdatingProductId(product.id)
    try {
      if (supabase) {
        if (!isUuid(product.id)) { notify('تعذر تحديث التوفر: معرّف المنتج غير صالح.', 'error'); return false }
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          notify('لا يوجد اتصال بالإنترنت. أعد الاتصال ثم حاول مجدداً.', 'error'); return false
        }
        const { error } = await supabase.from('products').update({ is_available: nextValue }).eq('id', product.id)
        if (error) { notify(saveFailureMessage(error, 'تحديث توفر المنتج'), 'error'); return false }
      }
      setProducts(prev => prev.map(item => item.id === product.id ? { ...item, is_available: nextValue } : item))
      notify(nextValue ? 'تم تفعيل توفر المنتج' : 'تم إيقاف توفر المنتج')
      return true
    } catch (error) {
      notify(saveFailureMessage(error, 'تحديث توفر المنتج'), 'error')
      return false
    } finally {
      productActionLocks.current.delete(product.id)
      setUpdatingProductId(null)
    }
  }
  const toggleProductPublished = async (product) => {
    if (!product?.id || productActionLocks.current.size > 0 || updatingProductId || updatingProductPublishId) return
    productActionLocks.current.add(product.id)
    const nextValue = product.is_published === false
    setUpdatingProductPublishId(product.id)
    try {
      if (supabase) {
        if (!isUuid(product.id)) { notify('تعذر تحديث ظهور المنتج: معرّف المنتج غير صالح.', 'error'); return false }
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          notify('لا يوجد اتصال بالإنترنت. أعد الاتصال ثم حاول مجدداً.', 'error'); return false
        }
        const { error } = await supabase.from('products').update({ is_published: nextValue }).eq('id', product.id)
        if (error) { notify(saveFailureMessage(error, nextValue ? 'إظهار المنتج' : 'إخفاء المنتج'), 'error'); return false }
      }
      setProducts(prev => prev.map(item => item.id === product.id ? { ...item, is_published: nextValue } : item))
      notify(nextValue ? 'تم إظهار المنتج' : 'تم إخفاء المنتج')
      return true
    } catch (error) {
      notify(saveFailureMessage(error, nextValue ? 'إظهار المنتج' : 'إخفاء المنتج'), 'error')
      return false
    } finally {
      productActionLocks.current.delete(product.id)
      setUpdatingProductPublishId(null)
    }
  }
  const uploadImage = async (file, onUploaded) => {
    if (uploading) return false
    if (!supabase || !allowedOwner) return notify('يلزم تسجيل دخول المدير وتهيئة Supabase', 'error')
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return notify('لا يوجد اتصال بالإنترنت. أعد الاتصال قبل رفع الصورة.', 'error')
    if (!file || !['image/jpeg','image/png','image/webp'].includes(file.type)) return notify('اختر صورة بصيغة JPG أو PNG أو WebP', 'error')
    if (file.size > 5 * 1024 * 1024) return notify('الحد الأقصى لحجم الصورة 5MB', 'error')
    setUploading(true)
    try {
      const optimizedImage = await optimizeImageForUpload(file)
      const path = `${Date.now()}-${crypto.randomUUID()}.webp`
      const { error } = await supabase.storage.from('menugo-assets').upload(path, optimizedImage, {
        upsert: false,
        contentType: 'image/webp',
        cacheControl: '604800'
      })
      if (error) { notify(saveFailureMessage(error, 'رفع الصورة'), 'error'); return false }
      const { data } = supabase.storage.from('menugo-assets').getPublicUrl(path)
      if (!data?.publicUrl) { notify('تم رفع الصورة، لكن تعذر الحصول على رابطها. حدّث الصفحة قبل إعادة الرفع.', 'error'); return false }
      onUploaded(data.publicUrl)
      notify('تم رفع الصورة بنجاح')
      return true
    } catch (error) {
      notify(saveFailureMessage(error, 'رفع الصورة'), 'error')
      return false
    } finally { setUploading(false) }
  }
  const submitReview = async () => {
    if (!reviewDraft.product || !supabase) return
    const currentReviewProduct = products.find(product => product.id === reviewDraft.product.id)
    if (!currentReviewProduct || currentReviewProduct.is_available === false) {
      setReviewDraft({ product: null, rating: 5, comment: '' })
      return notify('التقييم غير متاح لهذا المنتج حالياً.', 'error')
    }
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
      label: new Date(`${item.day}T12:00:00`).toLocaleDateString('ar', { weekday: 'short', day: 'numeric' }),
      visits: Number(item.visits || 0)
    }))
    const topProducts = (stats.top_products || []).map(item => ({
      name: products.find(p => p.id === item.product_id) ? localized(products.find(p => p.id === item.product_id), 'name') : 'منتج محذوف',
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
      if (s.data) setSettings({ ...initialSettings, ...s.data, currency: 'SYP' })
      // With Supabase configured, never retain demo records (their IDs such as "cold"
      // are labels, not UUIDs accepted by PostgreSQL).
      if (c.error) {
        setCategories([])
        console.error('تعذر تحميل الأقسام:', c.error)
      } else {
        setCategories(c.data || [])
      }
      if (p.error) {
        setProducts([])
        console.error('تعذر تحميل المنتجات:', p.error)
      } else {
        setProducts(p.data || [])
      }
      setMenuDataReady(true)
    })()
    return () => { alive = false }
  }, [session])

  // حفظ القسم والبحث وموضع التمرير حتى يعود الزائر إلى نفس مكانه بعد تحديث الصفحة.
  useEffect(() => {
    if (page !== 'menu') return
    const savePosition = () => {
      try {
        sessionStorage.setItem(MENU_POSITION_KEY, JSON.stringify({
          activeCategory,
          search,
          scrollY: window.scrollY
        }))
      } catch { /* قد يكون تخزين الجلسة معطلاً في المتصفح */ }
    }
    let frame = 0
    const onScroll = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        savePosition()
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('pagehide', savePosition)
    return () => {
      savePosition()
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('pagehide', savePosition)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [page, activeCategory, search])

  useEffect(() => {
    if (page !== 'menu' || !menuDataReady || menuRestoreApplied.current) return
    const saved = readSavedMenuPosition()
    if (!saved) { menuRestoreApplied.current = true; return }
    menuRestoreApplied.current = true
    const firstFrame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: Math.max(0, Number(saved.scrollY) || 0), behavior: 'auto' })
      })
    })
    return () => window.cancelAnimationFrame(firstFrame)
  }, [page, menuDataReady])

  const userProviders = session?.user?.app_metadata?.providers || []
  const isGoogleUser = session?.user?.app_metadata?.provider === 'google' || userProviders.includes('google')
  const allowedOwner = Boolean(session?.user?.email && session.user.email.toLowerCase() === ownerEmail && session.user.email_confirmed_at && isGoogleUser)
  const isAdminEntry = new URLSearchParams(window.location.search).get('admin') === '1'

  // ?admin=1 opens the dashboard initially; an authenticated owner can move between
  // the public menu and dashboard without losing the persisted Supabase session.

  const visibleCategories = categories.filter(c => c.is_visible !== false && c.is_published !== false).sort((a,b) => a.sort_order-b.sort_order)
  const shownProducts = useMemo(() => products.filter(p =>
    p.is_published !== false &&
    (activeCategory === 'all' || p.category_id === activeCategory) &&
    (`${localized(p,'name')} ${localized(p,'description')}`).toLowerCase().includes(search.toLowerCase())
  ), [products, activeCategory, search])
  const total = cart.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0)
  const count = cart.reduce((sum, item) => sum + item.quantity, 0)
  const todayKey = new Date().toDateString()
  const localTodayOrders = orders.filter(order => order.created_at && new Date(order.created_at).toDateString() === todayKey)
  const orderStatsReady = !supabase || orderDashboardStats !== null
  const todayOrdersCount = orderDashboardStats?.todayOrders ?? (supabase ? 0 : localTodayOrders.length)
  const todayRevenue = orderDashboardStats?.todayRevenue ?? (supabase ? 0 : localTodayOrders.filter(order => order.status !== 'cancelled').reduce((sum, order) => sum + Number(order.total || 0), 0))
  const newOrdersCount = orderDashboardStats?.newOrdersCount ?? (supabase ? 0 : orders.filter(order => order.status === 'new').length)
  const availableProductsCount = products.filter(product => product.is_available !== false && product.is_published !== false).length
  const orderStatusLabel = status => ({ new: 'جديد', preparing: 'قيد التحضير', ready: 'جاهز', completed: 'مكتمل', cancelled: 'ملغي' }[status] || 'غير محدد')

  const notify = (msg, kind) => {
    const rawMessage = String(msg ?? '')
    const friendlyMessage = rawMessage
    const inferredKind = kind || (/تعذر|فشل|خطأ|يلزم|غير متاح|فارغة|أدخل|اختر|الحد الأقصى/i.test(friendlyMessage) ? 'error' : 'success')
    setNoticeKind(inferredKind)
    setNotice(friendlyMessage)
  }
  const saveFailureMessage = (error, operation = 'الحفظ') => {
    const message = String(error?.message || error || '')
    const networkFailure = typeof navigator !== 'undefined' && navigator.onLine === false || /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet_disconnected|connection|timed? ?out|aborted/i.test(message)
    return networkFailure
      ? `انقطع الاتصال أثناء ${operation}. لم نتمكن من تأكيد وصول التغيير إلى قاعدة البيانات. تحقق من الإنترنت ثم حدّث القائمة قبل إعادة المحاولة لتجنب تكرار العملية.`
      : `تعذر ${operation}: ${message || 'حدث خطأ غير متوقع'}`
  }
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 3600)
    return () => window.clearTimeout(timer)
  }, [notice])
  const updateSetting = (key, value) => setSettings(prev => ({ ...prev, [key]: value }))
  const addToCart = (product) => {
    if (!product || product.is_available === false) return
    setCart(prev => {
    const found = prev.find(x => x.id === product.id)
    const arabicProduct = { ...product, name: localized(product, 'name'), description: localized(product, 'description') }
    return found ? prev.map(x => x.id === product.id ? { ...x, quantity: x.quantity + 1 } : x) : [...prev, { ...arabicProduct, quantity: 1 }]
    })
  }
  const changeQty = (id, delta) => setCart(prev => prev.map(x => x.id === id ? { ...x, quantity: x.quantity + delta } : x).filter(x => x.quantity > 0))
  const saveSettings = async () => {
    if (savingSettings) return
    if (!supabase) return notify('أضف إعدادات Supabase في ملف .env أولاً')
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return notify('لا يوجد اتصال بالإنترنت. أعد الاتصال قبل حفظ الإعدادات.', 'error')
    const rawLat = settings.restaurant_latitude
    const rawLon = settings.restaurant_longitude
    const hasLat = rawLat !== '' && rawLat != null
    const hasLon = rawLon !== '' && rawLon != null
    if (hasLat !== hasLon) return notify('أدخل خط العرض وخط الطول معاً')
    const latitude = hasLat ? Number(rawLat) : null
    const longitude = hasLon ? Number(rawLon) : null
    if (hasLat && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180)) {
      return notify('إحداثيات الموقع غير صحيحة؛ تحقق من خط العرض والطول')
    }
    setSavingSettings(true)
    try {
      const { error } = await supabase.from('restaurant_settings').upsert({
        ...settings, currency: 'SYP', restaurant_latitude: latitude, restaurant_longitude: longitude, id: 1
      })
      if (error) return notify(saveFailureMessage(error, 'حفظ الإعدادات'), 'error')
      notify('تم حفظ إعدادات المطعم')
    } catch (error) {
      notify(saveFailureMessage(error, 'حفظ الإعدادات'), 'error')
    } finally { setSavingSettings(false) }
  }
  const calculateRestaurantDistance = async () => {
    const destination = restaurantCoordinates(settings)
    if (!destination) {
      setDistanceInfo({ kind: 'error', text: 'أضف إحداثيات المطعم من لوحة الإدارة لحساب المسافة بدقة.' })
      return
    }
    if (!navigator.geolocation) {
      setDistanceInfo({ kind: 'error', text: 'متصفحك لا يدعم تحديد الموقع.' })
      return
    }
    setDistanceLoading(true)
    setDistanceInfo({ kind: 'loading', text: 'جارٍ تحديد موقعك وحساب مسافة الطريق...' })
    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true, timeout: 15000, maximumAge: 60000
        })
      })
      const response = await fetch('https://valhalla1.openstreetmap.de/route', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Client-Id': 'menu5go.github.io'
        },
        body: JSON.stringify({
          locations: [
            { lat: position.coords.latitude, lon: position.coords.longitude },
            { lat: destination.lat, lon: destination.lon }
          ],
          costing: 'auto',
          units: 'kilometers'
        })
      })
      if (!response.ok) throw new Error('تعذر الاتصال بخدمة حساب المسار')
      const result = await response.json()
      const kilometers = Number(result?.trip?.summary?.length)
      if (result?.trip?.status !== 0 || !Number.isFinite(kilometers) || kilometers < 0) {
        throw new Error('لم يتم العثور على طريق مناسب بين موقعك والمطعم')
      }
      const formattedDistance = kilometers < 1
        ? `${Math.max(10, Math.round(kilometers * 1000 / 10) * 10)} متر`
        : `${kilometers.toLocaleString('ar', { maximumFractionDigits: 1 })} كم`
      setDistanceInfo({ kind: 'success', text: `يبعد المطعم عنك ${formattedDistance} بالسيارة` })
    } catch (error) {
      let message = error?.message || 'تعذر حساب المسافة حالياً.'
      if (error?.code === 1) message = 'لم تسمح بتحديد موقعك. فعّل إذن الموقع ثم حاول مجدداً.'
      else if (error?.code === 2) message = 'تعذر تحديد موقعك الحالي. تحقق من تشغيل خدمة الموقع.'
      else if (error?.code === 3) message = 'انتهت مهلة تحديد موقعك. حاول مجدداً.'
      setDistanceInfo({ kind: 'error', text: message })
    } finally {
      setDistanceLoading(false)
    }
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
    if (savingCategory) return
    const name = categoryDraftAr.trim()
    if (!name) return notify('أدخل اسم القسم')
    if (supabase && typeof navigator !== 'undefined' && navigator.onLine === false) return notify('لا يوجد اتصال بالإنترنت. أعد الاتصال قبل حفظ القسم.', 'error')
    const payload = { name, name_ar: name, sort_order: categories.length + 1, is_visible: true, is_published: true }
    setSavingCategory(true)
    try {
      if (supabase) {
        if (editingCategory && !isUuid(editingCategory)) return notify('تعذر تعديل القسم: معرّف القسم غير صالح. حدّث الصفحة ثم حاول مجدداً.', 'error')
        const query = editingCategory
          ? supabase.from('categories').update({ name, name_ar: name }).eq('id', editingCategory)
          : supabase.from('categories').insert(payload)
        const { error } = await query
        if (error) return notify(saveFailureMessage(error, 'حفظ القسم'), 'error')
        const { data, error: reloadError } = await supabase.from('categories').select('*').order('sort_order')
        if (reloadError) return notify(`تم حفظ القسم، لكن تعذر تحديث القائمة: ${saveFailureMessage(reloadError, 'تحديث قائمة الأقسام')}`, 'error')
        setCategories(data || [])
      } else if (editingCategory) setCategories(prev => prev.map(c => c.id === editingCategory ? { ...c, ...payload } : c))
      else setCategories(prev => [...prev, { ...payload, id: crypto.randomUUID() }])
      setCategoryDraftAr(''); setEditingCategory(null); notify('تم حفظ القسم')
    } catch (error) {
      notify(saveFailureMessage(error, 'حفظ القسم'), 'error')
    } finally { setSavingCategory(false) }
  }
  const deleteCategory = async (id) => {
    setConfirmDialog({
      title: 'حذف القسم',
      message: 'هل أنت متأكد من حذف هذا القسم؟ سيتم أيضاً إزالة المنتجات المرتبطة به من القائمة.',
      confirmLabel: 'نعم، احذف القسم',
      onConfirm: async () => {
    if (supabase) {
      if (!isUuid(id)) { notify('تعذر حذف القسم: معرّف القسم غير صالح. حدّث الصفحة ثم حاول مجدداً.', 'error'); return false }
      const { error } = await supabase.from('categories').delete().eq('id', id)
      if (error) { notify(`تعذر حذف القسم: ${error.message}`, 'error'); return false }
    }
    setCategories(prev => prev.filter(c => c.id !== id)); setProducts(prev => prev.filter(p => p.category_id !== id))
    notify('تم حذف القسم')
    return true
      }
    })
  }
  const saveProduct = async () => {
    if (savingProduct) return
    if (!productDraft.name_ar.trim() || !productDraft.category_id || productDraft.price === '') return notify('أكمل اسم المنتج والقسم والسعر')
    if (supabase && typeof navigator !== 'undefined' && navigator.onLine === false) return notify('لا يوجد اتصال بالإنترنت. أعد الاتصال قبل حفظ المنتج.', 'error')
    const payload = { name: productDraft.name_ar.trim(), name_ar: productDraft.name_ar.trim(), description: productDraft.description_ar || '', description_ar: productDraft.description_ar || '', price: Number(productDraft.price), category_id: productDraft.category_id, image_url: productDraft.image_url, is_available: productDraft.is_available, is_featured: productDraft.is_featured, is_published: true }
    if (supabase) {
      if (editingProduct && !isUuid(editingProduct)) return notify('تعذر تعديل المنتج: معرّف المنتج غير صالح. حدّث الصفحة ثم حاول مجدداً.', 'error')
      if (!isUuid(productDraft.category_id)) return notify('تعذر حفظ المنتج: اختر قسماً صالحاً من قاعدة البيانات.', 'error')
    }
    setSavingProduct(true)
    try {
      if (supabase) {
        const query = editingProduct
          ? supabase.from('products').update(payload).eq('id', editingProduct)
          : supabase.from('products').insert(payload)
        const { error } = await query
        if (error) return notify(saveFailureMessage(error, 'حفظ المنتج'), 'error')
        const { data, error: reloadError } = await supabase.from('products').select('*').order('created_at', { ascending: false })
        if (reloadError) return notify(`تم حفظ المنتج، لكن تعذر تحديث القائمة: ${saveFailureMessage(reloadError, 'تحديث قائمة المنتجات')}`, 'error')
        if (data) setProducts(data)
      } else if (editingProduct) setProducts(prev => prev.map(p => p.id === editingProduct ? { ...p, ...payload } : p))
      else setProducts(prev => [{ ...payload, id: crypto.randomUUID() }, ...prev])
      setProductDraft(emptyProduct); setEditingProduct(null); notify('تم حفظ المنتج')
    } catch (error) {
      notify(saveFailureMessage(error, 'حفظ المنتج'), 'error')
    } finally { setSavingProduct(false) }
  }
  const deleteProduct = async (id) => {
    setConfirmDialog({
      title: 'حذف المنتج',
      message: 'هل تريد حذف هذا المنتج نهائياً من قائمة المطعم؟',
      confirmLabel: 'نعم، احذف المنتج',
      onConfirm: async () => {
    if (supabase) {
      if (!isUuid(id)) { notify('تعذر حذف المنتج: معرّف المنتج غير صالح. حدّث الصفحة ثم حاول مجدداً.', 'error'); return false }
      const { error } = await supabase.from('products').delete().eq('id', id)
      if (error) { notify(`تعذر حذف المنتج: ${error.message}`, 'error'); return false }
    }
    setProducts(prev => prev.filter(p => p.id !== id)); notify('تم حذف المنتج')
    return true
      }
    })
  }
  const unavailableCartItems = () => cart.filter(item => products.some(product => product.id === item.id && product.is_available === false))
  const sendWhatsApp = () => {
    if (unavailableCartItems().length) return notify('يوجد منتج غير متوفر في السلة. احذفه قبل إرسال الطلب.', 'error')
    if (!settings.whatsapp_enabled) return notify('الطلب عبر واتساب غير متاح حالياً')
    if (!cart.length) return notify('السلة فارغة')
    const lines = cart.map(x => `• ${x.name} × ${x.quantity} — ${money(x.price*x.quantity, settings.currency)}`).join('\\n')
    const message = `طلب جديد من ${settings.restaurant_name}\\n${lines}\\nالإجمالي: ${money(total, settings.currency)}\\nملاحظات: ${orderNote || 'لا يوجد'}`
    const url = whatsappUrl(settings.whatsapp_number, message)
    if (!url) return notify('أضف رقم واتساب صحيحاً من إعدادات المطعم')
    window.open(url, '_blank', 'noopener,noreferrer')
  }
  const submitInternalOrder = async () => {
    if (orderSubmitLock.current) return
    if (unavailableCartItems().length) return notify('يوجد منتج غير متوفر في السلة. احذفه قبل تأكيد الطلب.', 'error')
    if (new URLSearchParams(window.location.search).has('table') && !activeRestaurantTable && !activeQrIsGeneral) return notify('تعذر التعرف على الطاولة من رمز QR؛ أعد فتح رمز الطاولة الصحيح')
    if (!settings.internal_orders_enabled) return notify('الطلبات الداخلية غير مفعلة')
    if (!cart.length) return notify('السلة فارغة')
    if (!supabase) return notify('يلزم ربط Supabase لتسجيل الطلب داخلياً')
    orderSubmitLock.current = true
    try {
      let visitorId = localStorage.getItem('menugo_visitor_id')
      if (!visitorId) { visitorId = crypto.randomUUID(); localStorage.setItem('menugo_visitor_id', visitorId) }
      const { error } = await supabase.from('orders').insert({
        visitor_id: visitorId,
        items: cart.map(({id,name,price,quantity}) => ({ product_id:id, name, price, quantity })),
        total, notes: orderNote, status: 'new', restaurant_table_id: activeRestaurantTable?.id || null, table_name: activeRestaurantTable?.table_name || null
      })
      if (error) return notify(`تعذر تسجيل الطلب: ${error.message}`)
      setCart([]); setOrderNote(''); notify('تم إرسال الطلب بنجاح')
    } catch (error) {
      notify(`تعذر تسجيل الطلب: ${error.message || 'تحقق من الاتصال وحاول مجدداً'}`, 'error')
    } finally {
      orderSubmitLock.current = false
    }
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
    if (!supabase) return notify('اربط Supabase أولاً لحفظ رمز QR بشكل دائم')
    await loadRestaurantTables()
    notify('تم تحميل رموز QR المحفوظة')
  }


  useEffect(() => {
    document.documentElement.lang = 'ar'
    document.documentElement.dir = 'rtl'
  }, [])

  return <div className="app-shell" style={{'--brand': settings.primary_color || '#1d4738'}}>
    <header className="topbar">
      <button className="icon-btn mobile-menu" onClick={() => allowedOwner ? window.scrollTo({top: 0, behavior: 'smooth'}) : setPage('menu')} aria-label={allowedOwner ? 'لوحة الإدارة' : 'القائمة'}><Menu/></button>
      <div className="brand"><div className="brand-mark">{settings.logo_url?<img src={settings.logo_url} alt="logo"/>:<Store size={21}/>}</div><div><strong>{arabicValue(settings.restaurant_name) || 'مطعم MenuGo'}</strong></div></div>
<nav className="top-nav">
        {allowedOwner ? <>
          <button className={page==='menu'?'active':''} onClick={()=>setPage('menu')}>المينيو</button>
          <button className={page==='admin'?'active':''} onClick={()=>setPage('admin')}>لوحة الإدارة</button>
          {isAdminEntry ? <>
            <button className="admin-notification-link" onClick={() => { setReviewsNotificationDismissed(true); setActiveAdminSection('reviews'); loadReviews() }} aria-label="إشعارات التقييمات" title="إشعارات التقييمات"><Bell size={18}/><span>الإشعارات</span>{!reviewsNotificationDismissed&&reviews.length>0&&<i className="notification-count">{reviews.length}</i>}</button>
            <button className="admin-notification-link order-notification-link" onClick={() => { setOrdersNotificationDismissed(true); setActiveAdminSection('orders'); loadOrders() }} aria-label="تنبيهات الطلبات الجديدة" title="الطلبات الجديدة"><BellRing size={18}/><span>الطلبات</span>{!ordersNotificationDismissed&&newOrdersCount>0&&<i className="notification-count">{newOrdersCount}</i>}</button>
          </> : <button className={page==='cart'?'active':''} onClick={()=>setPage('cart')}>السلة <span className="count">{count}</span></button>}
        </> : <>
          <button className={`customer-menu-link ${page==='menu'?'active':''}`} onClick={()=>setPage('menu')}>المينيو</button>
          {!isAdminEntry&&<button className={page==='cart'?'active':''} onClick={()=>setPage('cart')}><ShoppingCart size={17}/> السلة <span className="count">{count}</span></button>}
          <button className={page==='my-orders'?'active':''} onClick={openMyOrders}><ClipboardList size={17}/> متابعة الطلب</button>
        </>}
      </nav>
    </header>

    {page==='menu' && <>
      <section className="customer-location-strip" aria-label="موقع المطعم والمسافة">
        <div className="customer-location-actions">
          {restaurantMapUrl(settings)&&<a className="customer-map-link" href={restaurantMapUrl(settings)} target="_blank" rel="noreferrer"><MapPinned size={17}/> موقع المطعم</a>}
          <button className="customer-distance-btn" type="button" onClick={calculateRestaurantDistance} disabled={distanceLoading}>{distanceLoading?'جارٍ الحساب...':'احسب المسافة'}</button>
        </div>
        {distanceInfo&&<small className={`customer-distance-result ${distanceInfo.kind}`} aria-live="polite">{distanceInfo.text}</small>}
      </section>
      <section className="hero">
        <div className="hero-copy"><span className="eyebrow">قائمة طعام • طازجة • شهية</span>{activeRestaurantTable&&<span className="table-order-badge">الطلب للطاولة: {activeRestaurantTable.table_name}</span>}<h1>{arabicValue(settings.tagline) || 'نكهات تستحق التجربة'}</h1><p>تصفح قائمتنا واختر ما يناسب ذوقك.</p><button className="primary-btn" onClick={()=>document.getElementById('menu-list')?.scrollIntoView({behavior:'smooth'})}>استكشف القائمة <ChevronDown size={17}/></button></div>
        <div className="hero-art"><div className="plate"><Coffee size={86}/></div><span className="art-leaf leaf-one"><Sparkles size={30}/></span><span className="art-leaf leaf-two"><Sparkles size={21}/></span></div>
      </section>
      <main id="menu-list" className="content">
        <div className="section-heading"><div><span className="eyebrow">قائمتنا</span><h2>قائمتنا</h2><p>اختر من أشهى الأصناف المحضرة بعناية</p></div><label className="search-box"><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="ابحث عن طبق أو مشروب..."/></label></div>
        <div className="category-tabs"><button className={activeCategory==='all'?'selected':''} onClick={()=>setActiveCategory('all')}>الكل</button>{visibleCategories.map(c=><button key={c.id} className={activeCategory===c.id?'selected':''} onClick={()=>setActiveCategory(c.id)}>{localized(c,'name')}</button>)}</div>
        <div className="product-grid">{shownProducts.map(p=><article className="product-card" key={p.id} onClick={()=>trackProductView(p.id)}><div className="product-image">{p.image_url?<img src={p.image_url} alt={p.name}/>:<div className="food-placeholder"><UtensilsCrossed size={34}/></div>}{p.is_featured&&<span className="featured">اختيار مميز</span>}{p.is_available===false&&<span className="product-availability unavailable menu-product-unavailable">غير متوفر</span>}</div><div className="product-info"><div><h3>{localized(p,'name')}</h3><p>{localized(p,'description')}</p></div><div className="product-bottom"><strong>{money(p.price,settings.currency)}</strong><button className="add-btn" disabled={p.is_available===false} onClick={()=>addToCart(p)} aria-label="إضافة المنتج">إضافة</button></div><button className="tiny-btn review-trigger" disabled={p.is_available===false} onClick={e=>{e.stopPropagation();if(p.is_available!==false)setReviewDraft({product:p,rating:5,comment:''})}}>قيّم هذا المنتج</button></div></article>)}</div>
        {!shownProducts.length&&<div className="empty-state">لا توجد منتجات مطابقة حالياً.</div>}
      </main>
      <footer id="restaurant-info" className="footer"><div className="socials">
        {settings.facebook_enabled&&settings.facebook_url&&<a href={settings.facebook_url} target="_blank" rel="noreferrer" aria-label="فيسبوك"><Facebook/></a>}
        {settings.instagram_enabled&&settings.instagram_url&&<a href={settings.instagram_url} target="_blank" rel="noreferrer" aria-label="إنستغرام"><Instagram/></a>}
      </div><div className="footer-welcome">نسعد بخدمتكم دائماً</div></footer>
    </>}

    {page==='cart'&&<main className="content narrow"><div className="section-heading"><div><span className="eyebrow">طلبك</span><h2>سلة الطلبات</h2><p>راجع طلبك قبل الإرسال</p></div><button className="outline-btn" onClick={()=>setPage('menu')}>العودة للقائمة</button></div>
      {!cart.length?<div className="empty-state"><ShoppingCart size={38}/><h3>سلتك فارغة</h3><p>أضف بعض الأصناف اللذيذة من القائمة.</p><button className="primary-btn" onClick={()=>setPage('menu')}>تصفح المينيو</button></div>:<div className="cart-layout"><section className="cart-items">{cart.map(item=><div className="cart-row" key={item.id}><div className="cart-thumb">{item.image_url?<img src={item.image_url} alt={item.name}/>:<UtensilsCrossed size={22}/>}</div><div className="cart-desc"><strong>{item.name}</strong><small>{money(item.price,settings.currency)} للقطعة</small></div><div className="qty"><button onClick={()=>changeQty(item.id,-1)}><Minus size={14}/></button><b>{item.quantity}</b><button onClick={()=>changeQty(item.id,1)}><Plus size={14}/></button></div><strong>{money(item.price*item.quantity,settings.currency)}</strong><button className="remove-btn" onClick={()=>changeQty(item.id,-item.quantity)}><Trash2 size={17}/></button></div>)}
      <label className="field-label">ملاحظات على الطلب<textarea value={orderNote} onChange={e=>setOrderNote(e.target.value)} placeholder="مثلاً: بدون بصل، أو صوص إضافي..."/></label></section><aside className="summary"><h3>ملخص الطلب</h3>{activeRestaurantTable&&<div><span>الطاولة</span><b>{activeRestaurantTable.table_name}</b></div>}<div><span>عدد الأصناف</span><b>{count}</b></div><div className="grand-total"><span>الإجمالي</span><strong>{money(total,settings.currency)}</strong></div>
      {settings.whatsapp_enabled&&<button className="whatsapp-btn" onClick={sendWhatsApp}>إرسال الطلب عبر واتساب</button>}
      {settings.internal_orders_enabled&&<button className="primary-btn full" onClick={submitInternalOrder}>تأكيد الطلب</button>}
      {!settings.whatsapp_enabled&&!settings.internal_orders_enabled&&<p className="muted">طرق الطلب غير مفعلة حالياً. يرجى التواصل مع المطعم.</p>}</aside></div>}
    </main>}

    {page==='my-orders'&&<main className="content narrow customer-orders-page"><div className="section-heading"><div><span className="eyebrow">متابعة الطلب</span><h2>طلباتي</h2></div><button className="outline-btn" onClick={loadMyOrders} disabled={myOrdersLoading}>تحديث</button></div>
      {myOrdersLoading?<div className="empty-state">جارٍ تحميل طلباتك...</div>:myOrders.length?<div className="customer-orders-list">{myOrders.map(order=><article className="order-card customer-order-card" key={order.id}><div className="order-card-heading"><div><b>طلب #{order.order_number || String(order.id).slice(0,8)}</b><small>{new Date(order.created_at).toLocaleString('ar')}</small></div><strong>{money(order.total,settings.currency)}</strong></div><div className="order-items-list">{(order.items||[]).map((item,index)=><span key={`${order.id}-${index}`}>{arabicValue(item.name)||'منتج'} <b>× {item.quantity}</b></span>)}</div><div className={`customer-order-status status-${order.status||'new'}`}>حالة الطلب: {orderStatusLabel(order.status||'new')}</div>{order.notes&&<p className="order-customer-note">ملاحظتك: {order.notes}</p>}</article>)}</div>:<div className="empty-state"><ClipboardList size={38}/><h3>لا توجد طلبات محفوظة</h3><button className="primary-btn" onClick={()=>setPage('menu')}>العودة إلى المينيو</button></div>}
    </main>}

    {page==='admin'&&isAdminEntry&&<main className="content admin-content">{!allowedOwner?<div className="empty-state"><LogIn size={38}/><h2>دخول صاحب المطعم</h2><p>تسجيل الدخول متاح لحساب Google المحدد لهذه النسخة فقط.</p><button className="primary-btn" onClick={login}><LogIn size={17}/> الدخول باستخدام Google</button></div>:<>
      <div className="admin-heading"><div><span className="eyebrow">MENUGO • ADMIN</span><h2>لوحة إدارة المطعم</h2><p>كل ما تحتاجه لإدارة مطعمك من مكان واحد</p></div><button className="outline-btn" onClick={logout}><LogOut size={16}/> تسجيل الخروج</button></div>
      <div className="admin-workspace">
        <aside className="admin-sidebar" aria-label="أقسام لوحة الإدارة">
          <div className="admin-sidebar-caption">القائمة الرئيسية</div>
          <button className={activeAdminSection==='analytics'?'active':''} onClick={()=>setActiveAdminSection('analytics')}><Eye size={18}/><span>الرئيسية</span></button>
          <button className={activeAdminSection==='orders'?'active':''} onClick={()=>setActiveAdminSection('orders')}><ClipboardList size={18}/><span>الطلبات</span><i>{newOrdersCount||''}</i></button>
          <button className={activeAdminSection==='products'?'active':''} onClick={()=>setActiveAdminSection('products')}><UtensilsCrossed size={18}/><span>المنتجات</span></button>
          <div className="admin-sidebar-extra">
            <div className="admin-sidebar-caption">إدارة القائمة</div>
            <button className={activeAdminSection==='categories'?'active':''} onClick={()=>setActiveAdminSection('categories')}><Tags size={18}/><span>الأقسام</span></button>
            <button className={activeAdminSection==='qr'?'active':''} onClick={()=>setActiveAdminSection('qr')}><QrCode size={18}/><span>الطاولات و QR</span></button>
            <div className="admin-sidebar-caption">إعدادات وتقارير</div>
            <button className={activeAdminSection==='settings'?'active':''} onClick={()=>setActiveAdminSection('settings')}><SlidersHorizontal size={18}/><span>إعدادات المطعم</span></button>
            <button className={activeAdminSection==='reviews'?'active':''} onClick={()=>setActiveAdminSection('reviews')}><Star size={18}/><span>التقييمات</span></button>
          </div>
        </aside>
        <div className="admin-main">
      <section id="analytics-panel" className={`admin-panel analytics-panel ${activeAdminSection==='analytics'?'admin-panel-active':'admin-panel-hidden'}`}>
        <div className="admin-welcome"><div><span className="eyebrow">لوحة المطعم</span><h3>أهلاً بك في {arabicValue(settings.restaurant_name) || 'MenuGo'}</h3><p>هذا ملخص نشاط مطعمك اليوم، ويمكنك الوصول إلى أهم المهام مباشرة.</p></div><span className="admin-date">{new Date().toLocaleDateString('ar', { weekday: 'long', day: 'numeric', month: 'long' })}</span></div>
        <div className="admin-overview-cards admin-overview-cards-live">
          <button onClick={()=>setActiveAdminSection('orders')}><span>طلبات اليوم</span><strong>{orderStatsReady ? todayOrdersCount : '—'}</strong><small>فتح إدارة الطلبات <ChevronDown size={13}/></small></button>
          <button onClick={()=>setActiveAdminSection('orders')}><span>مبيعات اليوم</span><strong>{orderStatsReady ? money(todayRevenue,settings.currency) : '—'}</strong><small>باستثناء الطلبات الملغاة <ChevronDown size={13}/></small></button>
          <button onClick={()=>setActiveAdminSection('orders')}><span>طلبات جديدة</span><strong>{orderStatsReady ? newOrdersCount : '—'}</strong><small>تحتاج إلى متابعة <ChevronDown size={13}/></small></button>
          <button onClick={()=>setActiveAdminSection('products')}><span>منتجات متاحة</span><strong>{availableProductsCount}</strong><small>من أصل {products.length} منتج <ChevronDown size={13}/></small></button>
        </div>
        <div className="admin-quick-actions">
          <button onClick={()=>setActiveAdminSection('products')}><Plus size={17}/><span>إضافة منتج</span></button>
          <button onClick={()=>setActiveAdminSection('categories')}><Tags size={17}/><span>إدارة الأقسام</span></button>
          <button onClick={()=>setActiveAdminSection('qr')}><QrCode size={17}/><span>رموز الطاولات</span></button>
          <button onClick={()=>setActiveAdminSection('settings')}><SlidersHorizontal size={17}/><span>إعدادات المطعم</span></button>
        </div>
        <div className="admin-recent-orders">
          <div className="panel-title"><ClipboardList/><div><h3>أحدث الطلبات</h3><p>آخر الطلبات المسجلة في النظام</p></div><button className="outline-btn" onClick={()=>setActiveAdminSection('orders')}>عرض الكل</button></div>
          {orders.length ? orders.slice(0,5).map(order=><button className="admin-recent-order" key={order.id} onClick={()=>setActiveAdminSection('orders')}><span className="admin-recent-order-main"><b>طلب #{order.order_number || order.id.slice(0,8)}</b><small>{new Date(order.created_at).toLocaleString('ar', { dateStyle: 'short', timeStyle: 'short' })}{order.table_name ? ` · ${order.table_name}` : ''}</small></span><strong>{money(order.total,settings.currency)}</strong><em className={`order-status status-${order.status || 'unknown'}`}>{orderStatusLabel(order.status)}</em></button>) : <p className="muted admin-no-orders">لا توجد طلبات مسجلة حتى الآن. ستظهر الطلبات الجديدة هنا تلقائياً.</p>}
        </div>
        <div className="panel-title admin-analytics-heading"><Eye/><div><h3>إحصائيات الزوار</h3><p>آخر 30 يوماً — تُحدّث عند فتح لوحة الإدارة</p></div><button className="outline-btn" onClick={loadAnalytics}>تحديث</button></div>
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
      <section id="settings-panel" className={`admin-panel ${activeAdminSection==='settings'?'admin-panel-active':'admin-panel-hidden'}`}>
        <div className="panel-title"><SlidersHorizontal/><div><h3>إعدادات المطعم</h3><p>إعدادات منظمة حسب نوع الخدمة، مع حفظ جميع التغييرات من زر واحد.</p></div></div>
        <div className="settings-tabs" role="tablist" aria-label="تصنيفات الإعدادات">
          {[['restaurant','معلومات المطعم'],['contact','التواصل'],['alerts','التنبيهات'],['location','الموقع'],['system','النظام']].map(([key,label])=><button type="button" role="tab" aria-selected={settingsTab===key} className={settingsTab===key?'active':''} onClick={()=>setSettingsTab(key)} key={key}>{label}</button>)}
        </div>
        {settingsTab==='restaurant'&&<div className="settings-group"><h4>معلومات المطعم والهوية</h4><div className="form-grid"><label>اسم المطعم<input value={settings.restaurant_name} onChange={e=>updateSetting('restaurant_name',e.target.value)}/></label><label>عبارة ترحيبية<input value={settings.tagline||''} onChange={e=>updateSetting('tagline',e.target.value)}/></label><label>العملة<input value="الليرة السورية (SYP)" readOnly aria-readonly="true"/></label><label>لون الهوية<input type="color" value={settings.primary_color||'#1d4738'} onChange={e=>updateSetting('primary_color',e.target.value)}/></label></div><div className="form-grid settings-media-grid"><label>شعار المطعم<input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={e=>uploadImage(e.target.files?.[0],url=>updateSetting('logo_url',url))}/>{settings.logo_url&&<img className="admin-image-preview" src={settings.logo_url} alt="شعار المطعم"/>}</label><label>صورة الغلاف<input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={e=>uploadImage(e.target.files?.[0],url=>updateSetting('cover_url',url))}/>{settings.cover_url&&<img className="admin-image-preview" src={settings.cover_url} alt="غلاف المطعم"/>}</label></div></div>}
        {settingsTab==='contact'&&<div className="settings-group"><h4>التواصل والروابط الاجتماعية</h4><div className="setting-row"><div><b>الطلب عبر واتساب</b><small>إظهار أو إخفاء زر الطلب عبر واتساب للزبائن</small></div><input type="checkbox" checked={!!settings.whatsapp_enabled} onChange={e=>updateSetting('whatsapp_enabled',e.target.checked)}/></div>{settings.whatsapp_enabled&&<label className="single-field">رقم واتساب مع رمز الدولة<input value={settings.whatsapp_number||''} onChange={e=>updateSetting('whatsapp_number',e.target.value)} placeholder="مثال: 33612345678"/></label>}<div className="social-setting"><div className="social-heading"><Facebook/><b>فيسبوك</b><input type="checkbox" checked={!!settings.facebook_enabled} onChange={e=>updateSetting('facebook_enabled',e.target.checked)}/></div>{settings.facebook_enabled&&<input value={settings.facebook_url||''} onChange={e=>updateSetting('facebook_url',e.target.value)} placeholder="رابط صفحة فيسبوك"/>}</div><div className="social-setting"><div className="social-heading"><Instagram/><b>إنستغرام</b><input type="checkbox" checked={!!settings.instagram_enabled} onChange={e=>updateSetting('instagram_enabled',e.target.checked)}/></div>{settings.instagram_enabled&&<input value={settings.instagram_url||''} onChange={e=>updateSetting('instagram_url',e.target.value)} placeholder="رابط حساب إنستغرام"/>}</div></div>}
        {settingsTab==='alerts'&&<div className="settings-group"><h4>التنبيهات وإدارة الطلبات</h4><div className="setting-row"><div><b>التنبيه الصوتي للطلبات الجديدة</b><small>تشغيل صوت عند وصول طلب جديد إلى لوحة الإدارة</small></div><input type="checkbox" checked={!!settings.order_sound_enabled} onChange={e=>{updateSetting('order_sound_enabled',e.target.checked);if(e.target.checked)playNewOrderSound()}}/></div><div className="setting-row"><div><b>إدارة حالات الطلبات</b><small>إظهار أو إخفاء خيارات تغيير حالة الطلب</small></div><input type="checkbox" checked={settings.order_status_enabled!==false} onChange={e=>updateSetting('order_status_enabled',e.target.checked)}/></div></div>}
        {settingsTab==='location'&&<div className="settings-group"><h4>موقع المطعم على الخريطة</h4><label className="single-field">وصف الموقع (للمدير فقط)<input value={settings.restaurant_address||''} onChange={e=>updateSetting('restaurant_address',e.target.value)} placeholder="وصف يساعدك على تذكر الموقع"/></label><label className="single-field">رابط موقع المطعم على خرائط Google<input type="url" value={settings.restaurant_location_url||''} onChange={e=>updateSetting('restaurant_location_url',e.target.value)} placeholder="https://maps.app.goo.gl/..."/></label><div className="location-coordinates"><label className="single-field">خط العرض<input type="number" step="any" value={settings.restaurant_latitude??''} onChange={e=>{updateSetting('restaurant_latitude',e.target.value);setDistanceInfo(null)}} placeholder="مثال: 33.5138"/></label><label className="single-field">خط الطول<input type="number" step="any" value={settings.restaurant_longitude??''} onChange={e=>{updateSetting('restaurant_longitude',e.target.value);setDistanceInfo(null)}} placeholder="مثال: 36.2765"/></label></div><small className="muted">أدخل إحداثيات المطعم أو رابط خرائط Google. الإحداثيات تحدد دبوس المطعم وتُستخدم لحساب مسافة الطريق.</small></div>}
        {settingsTab==='system'&&<div className="settings-group"><h4>إعدادات النظام واستقبال الطلبات</h4><div className="setting-row"><div><b>استقبال الطلبات داخل النظام</b><small>حفظ الطلبات في قاعدة البيانات لمتابعة حالتها</small></div><input type="checkbox" checked={!!settings.internal_orders_enabled} onChange={e=>updateSetting('internal_orders_enabled',e.target.checked)}/></div><p className="muted">يتم تطبيق هذه الخيارات على واجهة المطعم وعمليات استقبال الطلبات.</p></div>}
        <div className="settings-save-row"><span>تذكّر حفظ التغييرات قبل مغادرة الصفحة.</span><button className="primary-btn" disabled={savingSettings} aria-busy={savingSettings} onClick={saveSettings}><Save size={17}/> {savingSettings?'جارٍ الحفظ...':'حفظ الإعدادات'}</button></div>
      </section>
      <section id="categories-panel" className={`admin-panel ${activeAdminSection==='categories'?'admin-panel-active':'admin-panel-hidden'}`}><div className="panel-title"><Tags/><div><h3>إدارة الأقسام</h3><p>أضف أقساماً غير محددة العدد ورتبها حسب قائمتك.</p></div></div><div className="inline-form"><input value={categoryDraftAr} onChange={e=>setCategoryDraftAr(e.target.value)} placeholder="اسم القسم"/><button className="primary-btn" disabled={savingCategory} aria-busy={savingCategory} onClick={saveCategory}>{savingCategory?'جارٍ الحفظ...':editingCategory?'تحديث القسم':'إضافة قسم'}</button>{editingCategory&&<button className="outline-btn" onClick={()=>{setEditingCategory(null);setCategoryDraftAr('')}}>إلغاء</button>}</div>
        {categories.map(c=><div className="manage-row" key={c.id}><span>{categoryLabel(c)}</span><button className="tiny-btn" onClick={()=>{setEditingCategory(c.id);setCategoryDraftAr(categoryLabel(c));}}>تعديل</button><button className="tiny-btn icon-action" onClick={()=>moveCategory(c.id,-1)} title="تحريك لأعلى" aria-label="تحريك لأعلى"><ArrowUp size={16}/></button><button className="tiny-btn icon-action" onClick={()=>moveCategory(c.id,1)} title="تحريك لأسفل" aria-label="تحريك لأسفل"><ArrowDown size={16}/></button><button className="tiny-btn danger" onClick={()=>deleteCategory(c.id)}>حذف</button><button className="tiny-btn" onClick={async()=>{const v=!c.is_visible;if(supabase){const {error}=await supabase.from('categories').update({is_visible:v}).eq('id',c.id);if(error)return notify(error.message)}setCategories(prev=>prev.map(x=>x.id===c.id?{...x,is_visible:v}:x))}}>{c.is_visible===false?<EyeOff size={15}/>:<Eye size={15}/>}</button></div>)}
      </section>
      <section id="products-panel" className={`admin-panel ${activeAdminSection==='products'?'admin-panel-active':'admin-panel-hidden'}`}><div className="panel-title"><UtensilsCrossed/><div><h3>إدارة المنتجات</h3><p>إضافة المنتجات وتعديل الأسعار والتوفر والصور.</p></div></div>
        <div className="form-grid"><label>اسم المنتج<input value={productDraft.name_ar} onChange={e=>setProductDraft({...productDraft,name_ar:e.target.value})}/></label><label>السعر<input type="number" min="0" step="0.01" value={productDraft.price} onChange={e=>setProductDraft({...productDraft,price:e.target.value})}/></label><label>القسم<select value={productDraft.category_id} onChange={e=>setProductDraft({...productDraft,category_id:e.target.value})}><option value="">اختر القسم</option>{categories.map(c=><option key={c.id} value={c.id}>{categoryLabel(c)}</option>)}</select></label><label>صورة المنتج<input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={e=>uploadImage(e.target.files?.[0],url=>setProductDraft(prev=>({...prev,image_url:url})))}/>{productDraft.image_url&&<img className="admin-image-preview" src={productDraft.image_url} alt="معاينة"/>}{uploading&&<small>جارٍ رفع الصورة...</small>}</label><label>الوصف<textarea value={productDraft.description_ar} onChange={e=>setProductDraft({...productDraft,description_ar:e.target.value})}/></label></div>
        <div className="check-line"><label><input type="checkbox" checked={!!productDraft.is_available} onChange={e=>setProductDraft({...productDraft,is_available:e.target.checked})}/> متوفر</label><label><input type="checkbox" checked={!!productDraft.is_featured} onChange={e=>setProductDraft({...productDraft,is_featured:e.target.checked})}/> منتج مميز</label></div>
        <button className="primary-btn" disabled={savingProduct} aria-busy={savingProduct} onClick={saveProduct}>{savingProduct?'جارٍ الحفظ...':editingProduct?'تحديث المنتج':'إضافة المنتج'}</button>
        <div className="product-admin-list">{products.map(p=><article className="product-admin-card" key={p.id}><div className="product-admin-thumb">{p.image_url?<img src={p.image_url} alt={localized(p,'name')}/>:<UtensilsCrossed size={22}/>}</div><div className="product-admin-details"><b>{localized(p, 'name')}</b><strong>{money(p.price,settings.currency)}</strong><span className={p.is_available===false?'product-availability unavailable':'product-availability'}>{p.is_available===false?'غير متوفر':'متوفر'}</span></div><div className="product-admin-actions"><button className="tiny-btn" onClick={()=>{setEditingProduct(p.id);setProductDraft({...emptyProduct,...p,name_ar:p.name_ar||p.name,description_ar:p.description_ar||p.description,price:String(p.price)})}}>تعديل</button><button className="tiny-btn" disabled={!!updatingProductPublishId||!!updatingProductId} aria-busy={updatingProductPublishId===p.id} title={p.is_published===false?'إظهار المنتج':'إخفاء المنتج'} onClick={()=>toggleProductPublished(p)}>{updatingProductPublishId===p.id?'...':p.is_published===false?<EyeOff size={15}/>:<Eye size={15}/>}</button><button className="tiny-btn danger" onClick={()=>deleteProduct(p.id)}>حذف</button><button className={`availability-toggle ${p.is_available===false?'is-off':''}`} disabled={!!updatingProductId||!!updatingProductPublishId} onClick={()=>toggleProductAvailability(p)}>{updatingProductId===p.id?'...':p.is_available===false?'تفعيل التوفر':'إيقاف التوفر'}</button></div></article>)}</div>
      </section>
      <section id="orders-panel" className={`admin-panel ${activeAdminSection==='orders'?'admin-panel-active':'admin-panel-hidden'}`}><div className="panel-title"><ClipboardList/><div><h3>إدارة الطلبات</h3><p>طلباتك مرتبة حسب الحالة، مع تحديث سريع من البطاقة مباشرة.</p></div><button className="outline-btn" onClick={loadOrders}>تحديث</button></div>
        {orders.length ? <div className="orders-status-groups">{[['new','جديدة'],['preparing','قيد التحضير'],['ready','جاهزة'],['completed','مكتملة'],['cancelled','ملغاة']].map(([status,label])=>{const group=orders.filter(order=>(order.status||'new')===status);return <section className={`orders-status-group group-${status}`} key={status}><header><span className={`order-status status-${status}`}>{label}</span><b>{group.length}</b></header>{group.length?group.map(order=><article className="order-card order-management-card" key={order.id}><div className="order-card-heading"><div><b>طلب #{order.order_number || String(order.id).slice(0,8)}{order.table_name ? ` · ${order.table_name}` : ''}</b><small>{new Date(order.created_at).toLocaleString('ar')}</small></div><strong>{money(order.total,settings.currency)}</strong></div><div className="order-items-list">{(order.items||[]).map((item,index)=><span key={`${order.id}-${index}`}>{arabicValue(item.name)||'منتج'} <b>× {item.quantity}</b></span>)}</div>{order.notes&&<p className="order-customer-note">ملاحظة: {order.notes}</p>}{settings.order_status_enabled!==false&&<div className="order-quick-actions">{status==='new'&&<button disabled={updatingOrderId===order.id} onClick={()=>changeOrderStatus(order.id,'preparing')}>قبول وبدء التحضير</button>}{status==='preparing'&&<button disabled={updatingOrderId===order.id} onClick={()=>changeOrderStatus(order.id,'ready')}>تحديد كجاهز</button>}{status==='ready'&&<button disabled={updatingOrderId===order.id} onClick={()=>changeOrderStatus(order.id,'completed')}>إكمال الطلب</button>}{!['completed','cancelled'].includes(status)&&<button className="order-cancel-action" disabled={updatingOrderId===order.id} onClick={()=>setConfirmDialog({title:'تأكيد إلغاء الطلب',message:`هل أنت متأكد من إلغاء الطلب #${order.order_number || String(order.id).slice(0,8)}؟ لن يُلغى الطلب إلا بعد تأكيدك.`,confirmLabel:'نعم، ألغِ الطلب',onConfirm:()=>changeOrderStatus(order.id,'cancelled')})}>إلغاء الطلب</button>}{updatingOrderId===order.id&&<small>جارٍ تحديث الحالة...</small>}</div>}</article>):<p className="orders-group-empty">لا توجد طلبات {label.toLowerCase()} حالياً.</p>}</section>})}</div> : <p className="muted">لا توجد طلبات داخلية حتى الآن.</p>}
      </section>
      <section id="reviews-panel" className={`admin-panel ${activeAdminSection==='reviews'?'admin-panel-active':'admin-panel-hidden'}`}><div className="panel-title"><Star/><div><h3>تقييمات المنتجات (خاصة بالمدير)</h3><p>لا تظهر التقييمات أو متوسطاتها للزوار</p></div><button className="outline-btn" onClick={loadReviews}>تحديث</button></div>
        {reviews.map(r=><article className="order-card" key={r.product_id}><h4>{localized(products.find(p=>p.id===r.product_id), 'name') || 'منتج'}</h4><b>★ {r.average_rating} / 5 · {r.review_count} تقييم</b>{(r.reviews||[]).map(item=><p key={item.id}>{'★'.repeat(item.rating)} {item.comment || 'دون تعليق'} <small>{new Date(item.created_at).toLocaleString('ar')}</small></p>)}</article>)}
        {!reviews.length&&<p className="muted">لا توجد تقييمات بعد.</p>}
      </section>
      <section id="qr-panel" className={`admin-panel ${activeAdminSection==='qr'?'admin-panel-active':'admin-panel-hidden'}`}><div className="panel-title"><QrCode/><div><h3>إدارة رموز QR والطاولات</h3><p>الرموز محفوظة في قاعدة البيانات وتبقى ثابتة بعد إغلاق الموقع أو تسجيل الخروج.</p></div><button className="outline-btn" onClick={loadRestaurantTables}>تحديث</button></div>
        <div className="table-create-row"><input value={tableDraft} onChange={e=>setTableDraft(e.target.value)} placeholder="اسم الطاولة، مثل: طاولة 1"/><button className="primary-btn" onClick={addRestaurantTable}>إضافة طاولة</button></div>
        {tableLoading?<p className="muted">جارٍ تحميل الطاولات...</p>:<div className="restaurant-table-grid">{restaurantTables.map(table=><article className="restaurant-table-card" key={table.id}><h4>{table.is_general?'رمز القائمة العام':table.table_name}</h4><img src={tableQrImages[table.id]||''} alt={`رمز QR ${table.table_name}`}/><small>{table.is_general?'يفتح القائمة دون تحديد طاولة':'يفتح القائمة مع تحديد الطاولة تلقائياً'}</small><div className="table-qr-actions"><a className="outline-btn" href={tableQrImages[table.id]} download="menugo-qr.png">تنزيل</a><button className="outline-btn" onClick={()=>printTableQr(table)}>طباعة</button>{!table.is_general&&<button className="tiny-btn danger" onClick={()=>setConfirmDialog({title:'حذف الطاولة',message:`هل تريد حذف ${table.table_name}؟ سيتوقف رمزها عن العمل.`,onConfirm:()=>deleteRestaurantTable(table)})}>حذف</button>}</div></article>)}</div>}
      </section>
        </div>
      </div>
    </>}</main>}

    {reviewDraft.product&&<div className="review-backdrop"><section className="review-dialog"><button className="remove-btn" onClick={()=>setReviewDraft({product:null,rating:5,comment:''})}><X/></button><h3>تقييم المنتج: {localized(reviewDraft.product,'name')}</h3><label>التقييم بالنجوم<select value={reviewDraft.rating} onChange={e=>setReviewDraft({...reviewDraft,rating:e.target.value})}>{[5,4,3,2,1].map(n=><option key={n} value={n}>{'★'.repeat(n)} ({n})</option>)}</select></label><label>تعليق اختياري<textarea maxLength={1000} value={reviewDraft.comment} onChange={e=>setReviewDraft({...reviewDraft,comment:e.target.value})}/></label><button className="primary-btn" onClick={submitReview}>إرسال التقييم</button></section></div>}
    {notice&&<div className={`toast toast-${noticeKind}`} role="status" aria-live="polite">
      {noticeKind === 'error' ? <AlertCircle size={19}/> : <CheckCircle2 size={19}/>}
      <span>{notice}</span>
      <button className="toast-close" onClick={()=>setNotice('')} aria-label="إغلاق الإشعار"><X size={16}/></button>
    </div>}
    {confirmDialog&&<div className="confirm-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget&&!confirmBusy){setConfirmDialog(null);setConfirmBusy(false)}}}>
      <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message">
        <div className="confirm-icon"><ShieldAlert size={25}/></div>
        <h3 id="confirm-title">{confirmDialog.title}</h3>
        <p id="confirm-message">{confirmDialog.message}</p>
        <div className="confirm-actions">
          <button className="outline-btn" disabled={confirmBusy} onClick={()=>{setConfirmDialog(null);setConfirmBusy(false)}}>إلغاء</button>
          <button className="confirm-danger" disabled={confirmBusy} aria-busy={confirmBusy} onClick={async()=>{if(confirmBusy)return;setConfirmBusy(true);try{const result=await confirmDialog.onConfirm();if(result!==false)setConfirmDialog(null)}catch(error){notify(saveFailureMessage(error, 'تنفيذ العملية'), 'error')}finally{setConfirmBusy(false)}}}>{confirmBusy?'جارٍ التنفيذ...':(confirmDialog.confirmLabel || 'تأكيد الحذف')}</button>
        </div>
      </section>
    </div>}
    {page==='menu'&&cart.length>0&&!isAdminEntry&&<button className="floating-cart" onClick={()=>setPage('cart')}><ShoppingCart/> إرسال الطلب <b>{count}</b><strong>{money(total,settings.currency)}</strong></button>}
  </div>
}