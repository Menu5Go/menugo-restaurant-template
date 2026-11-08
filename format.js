export const money = (value, currency = 'EUR') =>
  new Intl.NumberFormat('ar', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value || 0))

export const whatsappUrl = (phone, message) => {
  const number = String(phone || '').replace(/\D/g, '')
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(message)}` : ''
}