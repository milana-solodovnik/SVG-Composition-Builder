import { useState, useRef, useEffect } from 'react'
import componentsData from './data/components.json'
import palettesData from './data/palettes.json'
import Background from './components/Background'
import { buildBackgroundSvgString } from './utils/background'
import compositionPatterns from './data/compositionPatterns.json'

export default function App() {
  const [canvasItems, setCanvasItems] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [selectedPalette, setSelectedPalette] = useState(null)
  const [svgContents, setSvgContents] = useState({})
  const [imageUrls, setImageUrls] = useState({})
  const [metaphor, setMetaphor] = useState('')
  const [isAiLoading, setIsAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')

  const [compType, setCompType] = useState('assembled')
  const [compSize, setCompSize] = useState('L')
  const [bgPattern, setBgPattern] = useState('header')

  // СЦЕНАРИЙ 2: поиск компонентов
  const [searchQuery, setSearchQuery] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const searchInputRef = useRef(null)

  const dragRef = useRef({ isDragging: false, startX: 0, startY: 0, itemStartX: 0, itemStartY: 0 })
  const prevSizeRef = useRef('L') // Для отслеживания смены размера

  const mainComponents = componentsData.filter(c => c.type === 'main')
  const shadeComponents = componentsData.filter(c => c.type === 'shade')
  const allComponents = componentsData

  const bgFileKey = 'bg_' + bgPattern

  // === АВТОМАТИЧЕСКОЕ МАСШТАБИРОВАНИЕ ПРИ СМЕНЕ РАЗМЕРА ===
  useEffect(() => {
    if (prevSizeRef.current === compSize) return
    if (canvasItems.length === 0) {
      prevSizeRef.current = compSize
      return
    }

    const oldScale = prevSizeRef.current === 'L' ? 1.0 : 0.65
    const newScale = compSize === 'L' ? 1.0 : 0.65
    const ratio = newScale / oldScale

    setCanvasItems(prev =>
      prev.map(item => ({
        ...item,
        scale: Math.max(0.3, Math.min(3, item.scale * ratio))
      }))
    )
    prevSizeRef.current = compSize
  }, [compSize])

  // === ЗАГРУЗКА SVG ===
  useEffect(() => {
    const loadSvgs = async () => {
      const contents = {}
      for (const comp of allComponents) {
        try {
          const res = await fetch(comp.file)
          contents[comp.id] = await res.text()
        } catch (e) {
          console.error(`Failed to load ${comp.file}`, e)
        }
      }
      for (const key of ['bg_full', 'bg_header']) {
        try {
          const res = await fetch(`/svg/${key}.svg`)
          contents[key] = await res.text()
        } catch (e) {
          console.warn(`Failed to load ${key}.svg`, e)
        }
      }
      setSvgContents(contents)
    }
    loadSvgs()
  }, [])

  // === ГЕНЕРАЦИЯ DATA URL ===
  useEffect(() => {
    const urls = {}
    for (const item of canvasItems) {
      const svgContent = svgContents[item.fileId]
      if (svgContent) {
        const isShade = item.fileId.includes('_shade')
        const recolored = recolorSvg(svgContent, selectedPalette, isShade)
        const blob = new Blob([recolored], { type: 'image/svg+xml' })
        urls[item.id] = URL.createObjectURL(blob)
      }
    }
    Object.values(imageUrls).forEach(url => {
      if (!Object.values(urls).includes(url)) URL.revokeObjectURL(url)
    })
    setImageUrls(urls)
  }, [canvasItems, svgContents, selectedPalette])

  // === ПЕРЕКРАСКА ===
  const recolorSvg = (svgString, palette, isShade = false) => {
    if (!palette) return svgString
    let result = svgString
    const baseMainColors = ['#F9ECB0', '#F9A3AA', '#FFE3E1', '#FFFFFF']
    const baseShadeColors = ['#D7CDF5', '#AA9BF0', '#7864D7', '#181817']
    const targetColors = isShade ? palette.shadeColors : palette.mainColors
    const baseColors = isShade ? baseShadeColors : baseMainColors
    const fills = [...result.matchAll(/fill="(#[0-9a-fA-F]{3,8})"/g)]
    fills.forEach(m => {
      const origColor = m[1].toUpperCase()
      const pos = baseColors.findIndex(c => c.toUpperCase() === origColor)
      if (pos !== -1 && pos < targetColors.length) {
        result = result.replace(m[0], `fill="${targetColors[pos]}"`)
      }
    })
    return result
  }

  // === ДОБАВЛЕНИЕ ===
  const addToCanvas = (component, x, y, rotation = 0, scale = 1) => {
    const sizeMultiplier = compSize === 'L' ? 1.0 : 0.65
    const newItem = {
      id: Date.now() + Math.random(),
      fileId: component.id,
      file: component.file,
      x: x !== undefined ? x : 550 + Math.random() * 100 - 50,
      y: y !== undefined ? y : 265 + Math.random() * 100 - 50,
      rotation,
      scale: scale * sizeMultiplier
    }
    setCanvasItems(prev => [...prev, newItem])
    setSelectedId(newItem.id)
  }

  // === СЦЕНАРИЙ 2: поиск ===
  const getSuggestions = (query) => {
    if (!query.trim()) return []
    const q = query.toLowerCase().trim()
    return allComponents
      .filter(c =>
        c.id.toLowerCase().includes(q) ||
        (c.keywords && c.keywords.some(k => k.toLowerCase().includes(q)))
      )
      .slice(0, 8)
  }

  const handleSearchChange = (e) => {
    const value = e.target.value
    setSearchQuery(value)
    const newSuggestions = getSuggestions(value)
    setSuggestions(newSuggestions)
    setShowSuggestions(newSuggestions.length > 0)
    setSelectedSuggestionIndex(-1)
  }

  const addComponentById = (id) => {
    const comp = allComponents.find(c => c.id === id)
    if (comp) {
      addToCanvas(comp)
      setSearchQuery('')
      setSuggestions([])
      setShowSuggestions(false)
      setSelectedSuggestionIndex(-1)
    }
  }

  const handleSearchKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedSuggestionIndex(prev => prev < suggestions.length - 1 ? prev + 1 : prev)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedSuggestionIndex(prev => prev > 0 ? prev - 1 : -1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (selectedSuggestionIndex >= 0 && suggestions[selectedSuggestionIndex]) {
        addComponentById(suggestions[selectedSuggestionIndex].id)
      } else if (suggestions.length > 0) {
        addComponentById(suggestions[0].id)
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
      setSelectedSuggestionIndex(-1)
    }
  }

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchInputRef.current && !searchInputRef.current.contains(e.target)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

    // === ПЕРЕРАЗМЕЩЕНИЕ ПОД ТИП КОМПОЗИЦИИ (нормализация, без схлопывания) ===
  const remapItems = (items, type) => {
    if (!items || items.length === 0) return []
    const xs = items.map(i => i.x), ys = items.map(i => i.y)
    const minX = Math.min(...xs), maxX = Math.max(...xs)
    const minY = Math.min(...ys), maxY = Math.max(...ys)
    const spanX = (maxX - minX) || 1
    const spanY = (maxY - minY) || 1

    // целевая зона: [x0,x1] [y0,y1]
    const place = (it, zone) => {
      const [x0, x1, y0, y1] = zone
      const nx = (it.x - minX) / spanX
      const ny = (it.y - minY) / spanY
      return { ...it, x: x0 + nx * (x1 - x0), y: y0 + ny * (y1 - y0) }
    }

    if (type === 'assembled') {
      // плотная группа в центре
      return items.map(it => place(it, [300, 700, 200, 440]))
    }

    if (type === 'header') {
      // всё в правой половине, левая пуста
      return items.map(it => place(it, [700, 1100, 140, 500]))
    }

    // offset: две группы по диагонали (сортировка по x)
    const sorted = [...items].sort((a, b) => a.x - b.x)
    const mid = Math.ceil(sorted.length / 2)
    const left = sorted.slice(0, mid)   // левый нижний угол
    const right = sorted.slice(mid)      // правый верхний угол
    const remapGroup = (group, zone) => {
      if (group.length === 0) return []
      const gx = group.map(i => i.x), gy = group.map(i => i.y)
      const gminX = Math.min(...gx), gmaxX = Math.max(...gx)
      const gminY = Math.min(...gy), gmaxY = Math.max(...gy)
      const gspanX = (gmaxX - gminX) || 1
      const gspanY = (gmaxY - gminY) || 1
      const [x0, x1, y0, y1] = zone
      return group.map(it => ({
        ...it,
        x: x0 + ((it.x - gminX) / gspanX) * (x1 - x0),
        y: y0 + ((it.y - gminY) / gspanY) * (y1 - y0)
      }))
    }
    return [...remapGroup(left, [180, 420, 320, 520]), ...remapGroup(right, [720, 960, 100, 300])]
  }
  
  // === ИИ-СБОРКА ===
  const handleAiBuild = async () => {
    if (!metaphor.trim()) {
      setAiError('Введите метафору или заголовок')
      return
    }

    setIsAiLoading(true)
    setAiError('')

    try {
      const apiKey = import.meta.env.VITE_OPENAI_API_KEY
      if (!apiKey) {
        throw new Error('API ключ не найден. Создайте файл .env с VITE_OPENAI_API_KEY')
      }

      // Находим ближайший паттерн по ключевым словам
      const metaphorLower = metaphor.toLowerCase()
      const matchedPattern = compositionPatterns.find(p => 
        p.metaphor.includes(metaphorLower) || 
        p.keywords.some(k => metaphorLower.includes(k))
      )

      // Если паттерн найден, используем его напрямую
            if (matchedPattern) {
        const remapped = remapItems(matchedPattern.composition, compType)
        setCanvasItems([])
        setTimeout(() => {
          remapped.forEach((item, idx) => {
            const component = allComponents.find(c => c.id === item.id)
            if (component) {
              setTimeout(() => {
                addToCanvas(component, item.x, item.y, 0, item.scale)
              }, idx * 80)
            }
          })
        }, 100)
        setIsAiLoading(false)
        return
      }

      // Если паттерн не найден, используем ИИ с промптом
      const componentsList = allComponents.map(c => {
        if (c.type === 'shade') {
          const baseName = c.id.replace('_shade', '')
          return `- ${c.id} [ФОНОВЫЙ ОБЪЕКТ]: ${c.keywords.join(', ')}`
        }
        return `- ${c.id} [ОСНОВНОЙ ОБЪЕКТ]: ${c.keywords.join(', ')}`
      }).join('\n')

      const sizeRule = compSize === 'L'
        ? 'Размер L: объекты КРУПНЫЕ, scale 1.8-2.4'
        : 'Размер S: объекты МЕЛКИЕ, scale 0.8-1.2'

      const typeRule = {
        assembled: 'Тип «Собранно»: все объекты в ЦЕНТРЕ холста, x от 300 до 700, y от 200 до 400',
        offset: 'Тип «Со смещением»: объекты по диагонали, первый x 200-400 y 300-500, второй x 700-900 y 100-300',
        header: 'Тип «Под заголовок»: все объекты в ПРАВОЙ половине, x от 700 до 1100'
      }[compType]

      const prompt = `Ты — профессиональный дизайнер изометрических SVG-композиций. Собери логичную и эстетичную сцену для метафоры "${metaphor}".

## ДОСТУПНЫЕ КОМПОНЕНТЫ
${componentsList}

## ПРАВИЛА ТИПА КОМПОЗИЦИИ: "${compType.toUpperCase()}"

### Если тип "СОБРАННО" (assembled):
- ВСЕ объекты ОБЯЗАНЫ находиться в зоне: x от 280 до 720, y от 180 до 480
- Максимальное расстояние между любыми двумя объектами: 350px
- Shade-объекты: x 280-500, y 160-320 (крупные, на заднем плане)
- Main-объекты: x 320-680, y 240-460 (на переднем плане, перекрывают shade)
- Все объекты образуют ЕДИНУЮ ПЛОТНУЮ ГРУППУ в центре холста

### Если тип "СО СМЕЩЕНИЕМ" (offset):
- Объекты РАЗНЕСЕНЫ ПО ДИАГОНАЛИ
- Первая группа: x 180-420, y 320-520 (левый нижний угол)
- Вторая группа: x 720-960, y 100-300 (правый верхний угол)
- Shade-объекты в одной из групп (не отдельно!)
- Расстояние между группами: минимум 250px
- Внутри каждой группы объекты близко (расстояние < 200px)

### Если тип "ПОД ЗАГОЛОВОК" (header):
- ВСЕ объекты ОБЯЗАНЫ находиться в ПРАВОЙ половине: x от 650 до 1150, y от 120 до 520
- ЛЕВАЯ ПОЛОВИНА (x от 0 до 650) АБСОЛЮТНО ПУСТАЯ — ни одного объекта
- Shade-объекты: x 680-900, y 120-280 (на заднем плане)
- Main-объекты: x 720-1100, y 200-500 (на переднем плане)

## ДРУГИЕ КРИТИЧЕСКИЕ ПРАВИЛА

### Правило 1: Иерархия размеров (НЕЛЬЗЯ нарушать)
- **Крупные объекты:** flower, flower_shade, lamp, lamp_shade → scale 2.0-2.5
- **Средние объекты:** book, folder, wallet, headphones → scale 1.4-1.8
- **Маленькие объекты:** phone, puzzles, coin, pen → scale 1.0-1.4
- Монета (coin) ВСЕГДА меньше кошелька (wallet), папки (folder), книги (book)
- Ручка (pen) ВСЕГДА меньше книги (book), папки (folder)
- Маленький объект не может быть больше среднего

### Правило 2: Shade-объекты ОБЯЗАНЫ быть рядом с основными
- Shade (с _shade) — это фоновая версия, которая создаёт глубину
- Shade должен стоять ЗА или РЯДОМ с основными объектами (в пределах 200px)
- НЕЛЬЗЯ ставить shade отдельно через пол холста
- Если shade = flower_shade, то основные объекты должны быть в той же зоне
- Если shade = lamp_shade, то основные объекты должны быть в той же зоне

### Правило 3: Все объекты в одной группе
- Для типа "Собранно": ВСЕ объекты в зоне x: 300-700, y: 200-450
- Максимальное расстояние между любыми двумя объектами — 300px
- НЕЛЬЗЯ ставить один объект в левом нижнем углу, а остальные в правом верхнем
- Все объекты должны образовывать единую композицию

### Правило 4: Физика расположения
- На вазе (flower) ничего не может лежать — ваза вертикальная
- На лампе (lamp) ничего не может лежать — лампа вертикальная
- Книга (book), папка (folder), кошелёк (wallet) — плоские, на них могут лежать монета, ручка, пазлы
- Монета (coin) и ручка (pen) — маленькие детали, лежат на поверхности или рядом

### Правило 5: Смысловые пары
Выбирай объекты, которые логически связаны:
- **Обучение:** book + lamp + pen (лампа светит на книгу, ручка на книге)
- **Творчество:** flower + pen + puzzles (ваза с цветами, ручка, пазлы)
- **Финансы:** wallet + coin + folder (кошелёк, монета, документы)
- **Музыка:** headphones + flower_shade (наушники, ваза как атмосфера)
- **Цифровые решения:** phone + puzzles + book_shade (телефон, пазлы, книга как фон)

### Правило 6: Только один крупный вертикальный объект
- В одной композиции может быть ТОЛЬКО ОДИН: либо ваза (flower/flower_shade), либо лампа (lamp/lamp_shade)
- НЕЛЬЗЯ ставить и вазу, и лампу вместе

## РАСПОЛОЖЕНИЕ ПО ТИПАМ

### Тип "Собранно" (assembled):
- ВСЕ объекты в зоне: x: 300-700, y: 200-450
- Shade-объект: x: 280-450, y: 180-320 (крупный, на заднем плане)
- Main-объекты: x: 320-650, y: 250-420 (рядом с shade)
- Пример правильной композиции:
  flower_shade(x:320,y:200,scale:2.3) + flower(x:360,y:240,scale:1.6) + pen(x:420,y:340,scale:1.2)
  Все объекты в пределах 200px друг от друга

### Тип "Со смещением" (offset):
- Две группы объектов по диагонали
- Первая группа: x: 200-400, y: 300-500
- Вторая группа: x: 700-900, y: 100-300
- Shade в одной из групп, не отдельно

### Тип "Под заголовок" (header):
- ВСЕ объекты в правой половине: x: 650-1100, y: 150-500
- Левая половина (x: 0-650) ПУСТАЯ
- Shade на заднем плане (правее/выше main)

## ПРИМЕРЫ ПРАВИЛЬНЫХ КОМПОЗИЦИЙ

### Пример 1: "Творчество", Собранно, L
[
  {"id":"flower_shade","x":320,"y":200,"rotation":0,"scale":2.3},
  {"id":"flower","x":360,"y":240,"rotation":0,"scale":1.6},
  {"id":"pen","x":420,"y":340,"rotation":0,"scale":1.2},
  {"id":"puzzles","x":480,"y":320,"rotation":0,"scale":1.3}
]

### Пример 2: "Финансы", Собранно, L
[
  {"id":"folder_shade","x":350,"y":220,"rotation":0,"scale":2.0},
  {"id":"wallet","x":380,"y":280,"rotation":0,"scale":1.5},
  {"id":"coin","x":450,"y":320,"rotation":0,"scale":1.1},
  {"id":"pen","x":420,"y":350,"rotation":0,"scale":1.2}
]

### Пример 3: "Обучение", Собранно, L
[
  {"id":"lamp_shade","x":480,"y":180,"rotation":0,"scale":2.2},
  {"id":"book","x":320,"y":280,"rotation":0,"scale":1.6},
  {"id":"lamp","x":520,"y":220,"rotation":0,"scale":1.4},
  {"id":"pen","x":380,"y":360,"rotation":0,"scale":1.2}
]

## ЗАДАНИЕ

Собери УНИКАЛЬНУЮ композицию для метафоры "${metaphor}" (тип: ${compType}, размер: ${compSize}).

ПРОВЕРЬ ПЕРЕД ОТВЕТОМ:
1. Все объекты в одной зоне (расстояние между любыми двумя < 300px для assembled)
2. Shade рядом с основными объектами (не отдельно через пол холста)
3. Соблюдена иерархия размеров (маленький < средний < крупный)
4. Только один крупный вертикальный объект (ваза ИЛИ лампа)
5. Объекты смыслово связаны с метафорой
6. Соблюдены координаты для выбранного типа

Ответь СТРОГО JSON массивом, без текста до и после.`

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'http://localhost:5173',
          'X-Title': 'SVG Composition Builder'
        },
        body: JSON.stringify({
          model: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
          messages: [
            { role: 'system', content: 'Отвечай СТРОГО JSON-массивом.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.5
        })
      })

      if (!response.ok) {
        throw new Error(`Ошибка API: ${response.status}`)
      }

      const data = await response.json()
      const aiResponse = data.choices[0].message.content

      const jsonMatch = aiResponse.match(/\[[\s\S]*\]/)
      if (!jsonMatch) {
        throw new Error('ИИ вернул некорректный формат')
      }

      const items = JSON.parse(jsonMatch[0])

      // === ВАЛИДАЦИЯ КОМПОЗИЦИИ (гарантирует соблюдение правил) ===
            const validatedItems = remapItems(items, compType)

      setCanvasItems([])
      setTimeout(() => {
        validatedItems.forEach((item, idx) => {
          const component = allComponents.find(c => c.id === item.id)
          if (component) {
            setTimeout(() => {
              addToCanvas(component, item.x, item.y, item.rotation || 0, item.scale || 1)
            }, idx * 80)
          }
        })
      }, 100)

    } catch (error) {
      console.error('AI Error:', error)
      setAiError(error.message || 'Ошибка при запросе к ИИ')
    } finally {
      setIsAiLoading(false)
    }
  }

  // === DRAG ===
  const handleItemMouseDown = (e, item) => {
    e.stopPropagation()
    setSelectedId(item.id)
    dragRef.current = {
      isDragging: true,
      startX: e.clientX,
      startY: e.clientY,
      itemStartX: item.x,
      itemStartY: item.y
    }
  }

  const handleCanvasMouseMove = (e) => {
    if (!dragRef.current.isDragging) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    const newX = Math.max(-50, Math.min(1150, dragRef.current.itemStartX + dx))
    const newY = Math.max(-50, Math.min(580, dragRef.current.itemStartY + dy))
    setCanvasItems(prev =>
      prev.map(item => item.id === selectedId ? { ...item, x: newX, y: newY } : item)
    )
  }

  useEffect(() => {
    const stopDrag = () => { dragRef.current.isDragging = false }
    window.addEventListener('mouseup', stopDrag)
    return () => window.removeEventListener('mouseup', stopDrag)
  }, [])

  // === УПРАВЛЕНИЕ ===
  const updateSelected = (patch) => {
    setCanvasItems(prev =>
      prev.map(item => item.id === selectedId ? { ...item, ...patch } : item)
    )
  }

  const deleteSelected = () => {
    setCanvasItems(prev => prev.filter(item => item.id !== selectedId))
    setSelectedId(null)
  }

  const duplicateSelected = () => {
    const item = canvasItems.find(i => i.id === selectedId)
    if (!item) return
    const copy = { ...item, id: Date.now() + Math.random(), x: item.x + 30, y: item.y + 30 }
    setCanvasItems(prev => [...prev, copy])
    setSelectedId(copy.id)
  }

  const rotateSelected = () => {
    const item = canvasItems.find(i => i.id === selectedId)
    if (!item) return
    updateSelected({ rotation: (item.rotation + 90) % 360 })
  }

  const scaleSelected = (delta) => {
    const item = canvasItems.find(i => i.id === selectedId)
    if (!item) return
    updateSelected({ scale: Math.max(0.3, Math.min(3, item.scale + delta)) })
  }

  const moveLayer = (dir) => {
    setCanvasItems(prev => {
      const idx = prev.findIndex(i => i.id === selectedId)
      if (idx === -1) return prev
      const newIdx = dir === 'up' ? Math.min(idx + 1, prev.length - 1) : Math.max(idx - 1, 0)
      if (newIdx === idx) return prev
      const arr = [...prev]
      const [item] = arr.splice(idx, 1)
      arr.splice(newIdx, 0, item)
      return arr
    })
  }

  // === ЭКСПОРТ ===
  const exportSvg = () => {
    const svgElements = canvasItems.map(item => {
      const svgContent = svgContents[item.fileId] || ''
      const isShade = item.fileId.includes('_shade')
      const recolored = recolorSvg(svgContent, selectedPalette, isShade)

      const parser = new DOMParser()
      const doc = parser.parseFromString(recolored, 'image/svg+xml')
      const svgEl = doc.querySelector('svg')

      let viewBox = '0 0 100 100'
      if (svgEl && svgEl.getAttribute('viewBox')) {
        viewBox = svgEl.getAttribute('viewBox')
      }

      const innerContent = svgEl ? svgEl.innerHTML : ''

      return `
        <g transform="translate(${item.x + 50}, ${item.y + 50}) rotate(${item.rotation}) scale(${item.scale}) translate(-50, -50)">
          <svg width="100" height="100" viewBox="${viewBox}">
            ${innerContent}
          </svg>
        </g>
      `
    }).join('\n')

    const bgSvg = buildBackgroundSvgString(svgContents[bgFileKey], bgFileKey, selectedPalette, 1200, 630)

    const fullSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  ${bgSvg}
  ${svgElements}
</svg>`

    const blob = new Blob([fullSvg], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'composition.svg'
    link.click()
    URL.revokeObjectURL(url)
  }

  const selectedItem = canvasItems.find(i => i.id === selectedId)

  return (
    <div className="flex h-screen bg-gray-100">

      {/* ЛЕВАЯ ПАНЕЛЬ */}
      <div className="w-72 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-800">📚 Библиотека</h2>
          <p className="text-xs text-gray-500 mt-1">Кликните, чтобы добавить</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4">

          {/* Основные объекты */}
          <div className="mb-5">
            <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
              Основные объекты
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {mainComponents.map(comp => (
                <button
                  key={comp.id}
                  onClick={() => addToCanvas(comp)}
                  className="flex flex-col items-center p-3 bg-gray-50 hover:bg-blue-50 border border-gray-200 hover:border-blue-300 rounded-lg transition-all cursor-pointer"
                >
                  <img src={comp.file} alt={comp.id} className="w-16 h-16 object-contain mb-2" />
                  <span className="text-xs text-gray-700 font-medium">{comp.id}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Фоновые (shade) объекты */}
          <div>
            <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
              Фоновые объекты (shade)
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {shadeComponents.map(comp => (
                <button
                  key={comp.id}
                  onClick={() => addToCanvas(comp)}
                  className="flex flex-col items-center p-3 bg-purple-50 hover:bg-purple-100 border border-purple-200 hover:border-purple-400 rounded-lg transition-all cursor-pointer"
                >
                  <img src={comp.file} alt={comp.id} className="w-16 h-16 object-contain mb-2" />
                  <span className="text-xs text-purple-700 font-medium">{comp.id}</span>
                </button>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* ЦЕНТР */}
      <div className="flex-1 flex items-center justify-center bg-gray-200 p-8 overflow-auto">
        <div
          onMouseMove={handleCanvasMouseMove}
          onMouseDown={() => setSelectedId(null)}
          className="shadow-lg relative overflow-hidden flex-shrink-0"
          style={{
            width: '1200px',
            height: '630px',
            backgroundColor: selectedPalette ? selectedPalette.background : 'white'
          }}
        >
          {selectedPalette && (
            <Background
              palette={selectedPalette}
              fileKey={bgFileKey}
              svgContents={svgContents}
              width={1200}
              height={630}
            />
          )}

          {canvasItems.map(item => (
            <div
              key={item.id}
              onMouseDown={(e) => handleItemMouseDown(e, item)}
              className={`absolute cursor-move ${selectedId === item.id ? 'ring-2 ring-blue-500 ring-offset-2' : ''}`}
              style={{
                left: `${item.x}px`,
                top: `${item.y}px`,
                transform: `rotate(${item.rotation}deg) scale(${item.scale})`,
                width: '100px',
                height: '100px'
              }}
            >
              {imageUrls[item.id] && (
                <img
                  src={imageUrls[item.id]}
                  alt={item.fileId}
                  className="w-full h-full object-contain pointer-events-none"
                />
              )}
            </div>
          ))}
          {canvasItems.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-400 pointer-events-none">
              <p>Кликните на компонент слева или используй ИИ-сборку</p>
            </div>
          )}
        </div>
      </div>

      {/* ПРАВАЯ ПАНЕЛЬ */}
      <div className="w-72 bg-white border-l border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-800">⚙️ Настройки</h2>
        </div>
        <div className="flex-1 p-4 overflow-y-auto">

          {/* СЦЕНАРИЙ 2: ПОИСК */}
          <div className="mb-6 p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
            <h3 className="text-sm font-semibold text-gray-700 mb-2"> Добавить по названию</h3>
            <p className="text-[11px] text-gray-500 mb-2">Введите id или ключевое слово. Доступны основные и фоновые (shade) объекты.</p>
            <div className="relative" ref={searchInputRef}>
              <input
                type="text"
                value={searchQuery}
                onChange={handleSearchChange}
                onKeyDown={handleSearchKeyDown}
                placeholder="Например: book, lamp_shade"
                className="w-full p-2 border border-gray-300 rounded text-sm"
              />
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                  {suggestions.map((comp, idx) => (
                    <button
                      key={comp.id}
                      onClick={() => addComponentById(comp.id)}
                      onMouseEnter={() => setSelectedSuggestionIndex(idx)}
                      className={`w-full flex items-center gap-2 p-2 text-left hover:bg-blue-50 transition-colors ${
                        idx === selectedSuggestionIndex ? 'bg-blue-50' : ''
                      }`}
                    >
                      <img src={comp.file} alt={comp.id} className="w-8 h-8 object-contain flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-gray-800 truncate">{comp.id}</div>
                        <div className="text-[10px] text-gray-500 truncate">
                          {comp.keywords?.slice(0, 3).join(', ')}
                        </div>
                      </div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${
                        comp.type === 'shade' ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'
                      }`}>
                        {comp.type === 'shade' ? 'shade' : 'main'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {searchQuery && suggestions.length === 0 && (
              <p className="text-[11px] text-gray-400 mt-2">Ничего не найдено</p>
            )}
          </div>

          {/* ИИ-СБОРКА */}
          <div className="mb-6 p-4 bg-gradient-to-br from-purple-50 to-blue-50 rounded-lg border border-purple-200">
            <h3 className="text-sm font-semibold text-gray-700 mb-2"> ИИ-сборка по метафоре</h3>
            <input
              type="text"
              value={metaphor}
              onChange={(e) => setMetaphor(e.target.value)}
              placeholder="Например: Обучение"
              className="w-full p-2 border border-gray-300 rounded text-sm mb-3"
              onKeyPress={(e) => e.key === 'Enter' && handleAiBuild()}
            />

            <div className="mb-2">
              <p className="text-xs font-semibold text-gray-600 mb-1">Тип композиции</p>
              <div className="flex gap-1">
                {[['assembled', 'Собранно'], ['offset', 'Со смещением'], ['header', 'Под заголовок']].map(([v, l]) => (
                  <button key={v} onClick={() => setCompType(v)}
                    className={`flex-1 p-1 text-[11px] border rounded transition-colors ${compType === v ? 'bg-purple-500 text-white border-purple-500' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-3">
              <p className="text-xs font-semibold text-gray-600 mb-1">Размер</p>
              <div className="flex gap-1">
                {[['L', 'L (крупно)'], ['S', 'S (мелко)']].map(([v, l]) => (
                  <button key={v} onClick={() => setCompSize(v)}
                    className={`flex-1 p-1 text-[11px] border rounded transition-colors ${compSize === v ? 'bg-purple-500 text-white border-purple-500' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleAiBuild}
              disabled={isAiLoading}
              className="w-full p-2 bg-purple-500 hover:bg-purple-600 text-white font-semibold rounded text-sm disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {isAiLoading ? '⏳ ИИ думает...' : '✨ Собрать с ИИ'}
            </button>
            {aiError && (
              <p className="text-xs text-red-600 mt-2">{aiError}</p>
            )}
          </div>

          {/* Палитра */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-2"> Цветовая палитра</h3>

            <div className="mb-3">
              <p className="text-xs font-semibold text-gray-600 mb-1">Фоны</p>
              <div className="flex gap-1">
                {[['header', 'Прямая поверхность'], ['full', 'Край стола']].map(([v, l]) => (
                  <button key={v} onClick={() => setBgPattern(v)}
                    className={`flex-1 p-1 text-[11px] border rounded transition-colors ${bgPattern === v ? 'bg-purple-500 text-white border-purple-500' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => setSelectedPalette(null)}
                className={`w-full p-2 text-sm border rounded transition-colors ${!selectedPalette ? 'bg-blue-50 border-blue-300' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'}`}
              >
                Без палитры
              </button>
              {palettesData.map(palette => (
                <button
                  key={palette.id}
                  onClick={() => setSelectedPalette(palette)}
                  className={`w-full p-2 text-sm border rounded flex items-center gap-2 transition-colors ${selectedPalette?.id === palette.id ? 'bg-blue-50 border-blue-300' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'}`}
                >
                  <div className="flex gap-1">
                    {palette.mainColors.map((color, idx) => (
                      <div key={idx} className="w-4 h-4 rounded" style={{ backgroundColor: color }} />
                    ))}
                  </div>
                  <span>{palette.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Управление элементом */}
          {selectedItem ? (
            <div className="space-y-3 mb-6">
              <p className="text-sm font-semibold text-gray-700">Выделен: {selectedItem.fileId}</p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={rotateSelected} className="p-2 bg-gray-100 hover:bg-gray-200 rounded text-sm">↻ Повернуть</button>
                <button onClick={duplicateSelected} className="p-2 bg-gray-100 hover:bg-gray-200 rounded text-sm">⧉ Дублировать</button>
                <button onClick={() => scaleSelected(-0.2)} className="p-2 bg-gray-100 hover:bg-gray-200 rounded text-sm">− Меньше</button>
                <button onClick={() => scaleSelected(0.2)} className="p-2 bg-gray-100 hover:bg-gray-200 rounded text-sm">+ Больше</button>
                <button onClick={() => moveLayer('up')} className="p-2 bg-gray-100 hover:bg-gray-200 rounded text-sm">▲ Слой выше</button>
                <button onClick={() => moveLayer('down')} className="p-2 bg-gray-100 hover:bg-gray-200 rounded text-sm">▼ Слой ниже</button>
              </div>
              <button onClick={deleteSelected} className="w-full p-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded text-sm">
                 Удалить
              </button>
            </div>
          ) : (
            <p className="text-sm text-gray-500 mb-6">Кликни на элемент для управления</p>
          )}

          {/* Экспорт */}
          <button
            onClick={exportSvg}
            disabled={canvasItems.length === 0}
            className="w-full p-3 bg-green-500 hover:bg-green-600 text-white font-semibold rounded disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
             Скачать SVG
          </button>

          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-600"><strong>Элементов:</strong> {canvasItems.length}</p>
          </div>
        </div>
      </div>

    </div>
  )
}