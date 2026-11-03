/**
 * Client-side image optimization for Pet Alert PH.
 * All new public pet-photo uploads are converted to WebP and must be <= 200 KB.
 * The optimizer tries progressively smaller dimensions and quality settings so
 * already-compressed or visually detailed photos are not rejected too early.
 */
export const MAX_IMAGE_INPUT_BYTES = 1 * 1024 * 1024
export const TARGET_IMAGE_BYTES = 120 * 1024
export const MAX_OPTIMIZED_IMAGE_BYTES = 200 * 1024
export const MAX_IMAGE_DIMENSION = 1280

// Preserve useful detail for identifying pets, but allow a smaller emergency
// fallback for photographs that remain large after normal compression.
const MIN_IMAGE_DIMENSION = 480
const DIMENSION_SCALE = 0.85
const QUALITY_LEVELS = [0.82, 0.76, 0.70, 0.64, 0.58, 0.52, 0.46, 0.40, 0.35]

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
      if (!image.naturalWidth || !image.naturalHeight) {
        reject(new Error("The selected photo has invalid dimensions. Please choose another image."))
        return
      }
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("Unable to read this photo. Please choose a JPG, PNG, or WebP image."))
    }
    image.src = url
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => {
        if (!blob) {
          reject(new Error("Unable to optimize the selected image. Please try another photo."))
          return
        }
        // Some browsers may ignore the requested output type. Do not label a
        // PNG/JPEG blob as WebP because the upload endpoint only accepts WebP.
        if (blob.type !== "image/webp") {
          reject(new Error("Your browser could not convert this photo to WebP. Please try another browser or photo."))
          return
        }
        resolve(blob)
      },
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

async function encodeAtDimensions(
  image: HTMLImageElement,
  width: number,
  height: number,
  targetBytes: number,
  maxOutputBytes: number,
): Promise<Blob | null> {
  const canvas = makeCanvas(image, width, height)
  let acceptableBlob: Blob | null = null

  for (const quality of QUALITY_LEVELS) {
    const blob = await canvasToBlob(canvas, quality)
    // Preserve the highest quality result that satisfies the hard upload cap.
    if (blob.size <= maxOutputBytes && !acceptableBlob) acceptableBlob = blob
    if (blob.size <= targetBytes) return blob
  }

  return acceptableBlob
}

export async function optimizeImageForUpload(
  source: File,
  options?: { maxDimension?: number; targetBytes?: number; maxOutputBytes?: number },
): Promise<OptimizedImage> {
  if (!source.type.startsWith("image/")) throw new Error("Please select an image file.")
  if (source.size > MAX_IMAGE_INPUT_BYTES) throw new Error("Photo must be 1 MB or smaller. Please resize it before uploading.")

  const maxDimension = options?.maxDimension ?? MAX_IMAGE_DIMENSION
  const targetBytes = options?.targetBytes ?? TARGET_IMAGE_BYTES
  const maxOutputBytes = options?.maxOutputBytes ?? MAX_OPTIMIZED_IMAGE_BYTES
  const image = await loadImage(source)

  const initialScale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight))
  let width = Math.max(1, Math.round(image.naturalWidth * initialScale))
  let height = Math.max(1, Math.round(image.naturalHeight * initialScale))
  let bestBlob: Blob | null = null

  // Always resample from the original image instead of repeatedly resizing an
  // already-compressed canvas, which can compound blur and compression damage.
  while (true) {
    const blob = await encodeAtDimensions(image, width, height, targetBytes, maxOutputBytes)
    if (blob && (!bestBlob || blob.size < bestBlob.size)) bestBlob = blob
    if (blob) break

    const longestSide = Math.max(width, height)
    if (longestSide <= MIN_IMAGE_DIMENSION) break

    const nextLongest = Math.max(MIN_IMAGE_DIMENSION, Math.round(longestSide * DIMENSION_SCALE))
    const scale = nextLongest / longestSide
    width = Math.max(1, Math.round(width * scale))
    height = Math.max(1, Math.round(height * scale))
  }

  if (!bestBlob || bestBlob.size > maxOutputBytes) {
    throw new Error("We couldn't reduce this photo below 200 KB. Please try cropping it or choosing a photo with less background detail.")
  }

  const safeBase = source.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 48) || "pet-photo"
  const file = new File([bestBlob], `${safeBase}.webp`, { type: "image/webp", lastModified: Date.now() })
  return { file, originalBytes: source.size, optimizedBytes: file.size }
}
