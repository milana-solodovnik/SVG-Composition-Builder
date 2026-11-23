// Точные словари: исходный hex из файла -> роль в палитре
const COLOR_MAPS = {
  bg_header: {
    '#d7cdf5': 'bg',
    '#aa9bf0': 'mid',
    '#7864d7': 'dark',
    '#ffffff': 'dot',
    'white':   'dot'
  },
  bg_full: {
    '#fdd7b9': 'bg',
    '#fac896': 'mid',
    '#d27532': 'dark'
  }
}

// Фон привязан к ПАЛИТРЕ (не к типу композиции)
export function getBackgroundFileKey(palette) {
  if (!palette) return null
  return palette.id === 'peach' ? 'bg_full' : 'bg_header'
}

function resolveRole(role, palette) {
  switch (role) {
    case 'bg':   return palette.background
    case 'mid':  return palette.shadeColors?.[0]
    case 'dark': return palette.shadeColors?.[1]
    case 'dot':  return palette.dotColor
    default:     return null
  }
}

// Перекрашивает содержимое файла по словарю; возвращает { inner, viewBox }
export function recolorBackground(svgText, fileKey, palette) {
  if (!svgText || !fileKey || !palette) return null
  const map = COLOR_MAPS[fileKey]
  if (!map) return null

  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml')
  const svgEl = doc.querySelector('svg')
  if (!svgEl) return null

  const viewBox = svgEl.getAttribute('viewBox') || '0 0 1000 1000'
  let inner = svgEl.innerHTML

  // Заменяем и fill, и stroke по точному словарю
  const attrRegex = /(fill|stroke)="([^"]+)"/gi
  inner = inner.replace(attrRegex, (whole, attr, val) => {
    const key = val.toLowerCase().trim()
    if (key === 'none') return whole
    const role = map[key]
    if (!role) return whole
    const newColor = resolveRole(role, palette)
    if (!newColor) return whole
    return `${attr}="${newColor}"`
  })

  return { inner, viewBox }
}

// Готовая строка <svg> для вставки в экспорт
export function buildBackgroundSvgString(svgText, fileKey, palette, w = 1200, h = 630) {
  const recolored = recolorBackground(svgText, fileKey, palette)
  if (!recolored) {
    return palette
      ? `<rect width="${w}" height="${h}" fill="${palette.background}"/>`
      : `<rect width="${w}" height="${h}" fill="#ffffff"/>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${recolored.viewBox}" preserveAspectRatio="none">${recolored.inner}</svg>`
}