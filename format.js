export const money = (value) =>
  new Intl.NumberFormat('ar', { style: 'currency', currency: 'SYP', maximumFractionDigits: 2 }).format(Number(value || 0))

export const whatsappUrl = (phone, message) => {
  const number = String(phone || '').replace(/\D/g, '')
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(message)}` : ''
}