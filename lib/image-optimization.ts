/**
 * Client-side image optimization for Pet Alert PH.
 * Future uploads are strictly limited to 1 MB before processing, then resized
 * and converted to WebP before they ever reach Supabase.
 */
export const MAX_IMAGE_INPUT_BYTES = 1 * 1024 * 1024
export const TARGET_IMAGE_BYTES = 120 * 1024
export const MAX_OPTIMIZED_IMAGE_BYTES = 200 * 1024
export const MAX_IMAGE_DIMENSION = 1280

const MIN_IMAGE_DIMENSION = 720
const START_QUALITY = 0.82
const MIN_QUALITY = 0.50
const QUALITY_STEP = 0.06

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

function makeCanvas(image: CanvasImageSource, width: number, height: number) {
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d", { alpha: false })
  if (!context) throw new Error("Image optimization is not supported by this browser.")
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = "high"
  context.drawImage(image, 0, 0, width, height)
  return canvas
}

async function encodeTowardTarget(canvas: HTMLCanvasElement, targetBytes: number) {
  let quality = START_QUALITY
  let blob = await canvasToBlob(canvas, quality)

  while (blob.size > targetBytes && quality > MIN_QUALITY) {
    quality = Math.max(MIN_QUALITY, quality - QUALITY_STEP)
    blob = await canvasToBlob(canvas, quality)
  }

  return blob
}

export async function optimizeImageForUpload(
  source: File,
  options?: { maxDimension?: number; targetBytes?: number; maxOutputBytes?: number },
): Promise<OptimizedImage> {
  if (!source.type.startsWith("image/")) throw new Error("Please select an image file.")
  if (source.size > MAX_IMAGE_INPUT_BYTES) throw new Error("Photo must be 1 MB or smaller.")

  const maxDimension = options?.maxDimension ?? MAX_IMAGE_DIMENSION
  const targetBytes = options?.targetBytes ?? TARGET_IMAGE_BYTES
  const maxOutputBytes = options?.maxOutputBytes ?? MAX_OPTIMIZED_IMAGE_BYTES
  const image = await loadImage(source)

  const initialScale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight))
  let width = Math.max(1, Math.round(image.naturalWidth * initialScale))
  let height = Math.max(1, Math.round(image.naturalHeight * initialScale))
  let canvas = makeCanvas(image, width, height)
  let blob = await encodeTowardTarget(canvas, targetBytes)

  // Detailed photos can remain large even at lower WebP quality. Reduce the
  // dimensions gradually while keeping enough resolution to identify markings,
  // collars, facial features and other useful pet details.
  while (blob.size > maxOutputBytes && Math.max(width, height) > MIN_IMAGE_DIMENSION) {
    const nextLongest = Math.max(MIN_IMAGE_DIMENSION, Math.round(Math.max(width, height) * 0.85))
    const scale = nextLongest / Math.max(width, height)
    const nextWidth = Math.max(1, Math.round(width * scale))
    const nextHeight = Math.max(1, Math.round(height * scale))

    canvas = makeCanvas(canvas, nextWidth, nextHeight)
    width = nextWidth
    height = nextHeight
    blob = await encodeTowardTarget(canvas, targetBytes)
  }

  if (blob.size > maxOutputBytes) {
    throw new Error("This photo could not be optimized below 200 KB. Please choose a simpler or smaller photo.")
  }

  const safeBase = source.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 48) || "pet-photo"
  const file = new File([blob], `${safeBase}.webp`, { type: "image/webp", lastModified: Date.now() })
  return { file, originalBytes: source.size, optimizedBytes: file.size }
}
