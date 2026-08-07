/**
 * Client-side image optimization for Pet Alert PH.
 * Resizes large uploads and converts them to WebP before they ever reach Supabase.
 */
const DEFAULT_MAX_DIMENSION = 1280
const DEFAULT_TARGET_BYTES = 500 * 1024
const ABSOLUTE_INPUT_LIMIT = 15 * 1024 * 1024

export type OptimizedImage = {
  file: File
  originalBytes: number
  optimizedBytes: number
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("Unable to read the selected image."))
    }
    image.src = url
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error("Unable to optimize the selected image.")),
      "image/webp",
      quality,
    )
  })
}

export async function optimizeImageForUpload(
  source: File,
  options?: { maxDimension?: number; targetBytes?: number },
): Promise<OptimizedImage> {
  if (!source.type.startsWith("image/")) throw new Error("Please select an image file.")
  if (source.size > ABSOLUTE_INPUT_LIMIT) throw new Error("Please choose an image smaller than 15 MB.")

  const maxDimension = options?.maxDimension ?? DEFAULT_MAX_DIMENSION
  const targetBytes = options?.targetBytes ?? DEFAULT_TARGET_BYTES
  const image = await loadImage(source)
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight))
  const width = Math.max(1, Math.round(image.naturalWidth * scale))
  const height = Math.max(1, Math.round(image.naturalHeight * scale))

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d", { alpha: false })
  if (!context) throw new Error("Image optimization is not supported by this browser.")
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = "high"
  context.drawImage(image, 0, 0, width, height)

  let quality = 0.8
  let blob = await canvasToBlob(canvas, quality)
  while (blob.size > targetBytes && quality > 0.56) {
    quality -= 0.06
    blob = await canvasToBlob(canvas, quality)
  }

  // If a very detailed image is still large, do one smaller resize pass.
  if (blob.size > targetBytes * 1.35 && Math.max(width, height) > 960) {
    const secondScale = 960 / Math.max(width, height)
    const secondWidth = Math.max(1, Math.round(width * secondScale))
    const secondHeight = Math.max(1, Math.round(height * secondScale))
    const smaller = document.createElement("canvas")
    smaller.width = secondWidth
    smaller.height = secondHeight
    const smallerContext = smaller.getContext("2d", { alpha: false })
    if (!smallerContext) throw new Error("Image optimization is not supported by this browser.")
    smallerContext.imageSmoothingEnabled = true
    smallerContext.imageSmoothingQuality = "high"
    smallerContext.drawImage(canvas, 0, 0, secondWidth, secondHeight)
    blob = await canvasToBlob(smaller, 0.72)
  }

  const safeBase = source.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 48) || "pet-photo"
  const file = new File([blob], `${safeBase}.webp`, { type: "image/webp", lastModified: Date.now() })
  return { file, originalBytes: source.size, optimizedBytes: file.size }
}
