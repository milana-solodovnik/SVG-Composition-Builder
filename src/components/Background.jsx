import { recolorBackground } from '../utils/background'

export default function Background({ palette, fileKey, svgContents, width = 1200, height = 630 }) {
  const recolored = recolorBackground(svgContents[fileKey], fileKey, palette)

  if (!recolored) {
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 0,
          backgroundColor: palette ? palette.background : 'white'
        }}
      />
    )
  }

  return (
    <div
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}
      dangerouslySetInnerHTML={{
        __html: `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="${recolored.viewBox}" preserveAspectRatio="none">${recolored.inner}</svg>`
      }}
    />
  )
}