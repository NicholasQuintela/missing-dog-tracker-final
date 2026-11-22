"use client"

import { useRef, useState } from "react"
import { ArrowLeft, BrainCircuit, CheckCircle2, ImagePlus, Loader2, ShieldCheck, X } from "lucide-react"
import Link from "next/link"
import * as ort from "onnxruntime-web"

const MODEL_VERSION = "pet-recognition-small@9dd4c915be29a81b116b3e30eb996c59d0e7ede0"
const MODEL_URL = "https://huggingface.co/open-noodle/pet-recognition-small/resolve/9dd4c915be29a81b116b3e30eb996c59d0e7ede0/recognition/model.onnx"
const INPUT_SIZE = 224
const MEAN = [0.485, 0.456, 0.406]
const STD = [0.229, 0.224, 0.225]

let sharedSession: ort.InferenceSession | null = null
let sharedModelPromise: Promise<ort.InferenceSession> | null = null

async function loadModel(onProgress: (progress: number | null) => void) {
  if (sharedSession) return sharedSession
  if (sharedModelPromise) return sharedModelPromise

  sharedModelPromise = (async () => {
    // WASM CPU is deliberately selected first for broad device/browser compatibility.
    ort.env.wasm.numThreads = 1
    ort.env.wasm.proxy = false
    onProgress(0)

    const response = await fetch(MODEL_URL, { cache: "force-cache" })
    if (!response.ok) throw new Error(`Model download failed (${response.status}).`)
    const total = Number(response.headers.get("content-length")) || 0
    const reader = response.body?.getReader()
    if (!reader) throw new Error("This browser cannot stream the model download.")

    const chunks: Uint8Array[] = []
    let received = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      received += value.length
      onProgress(total ? Math.min(100, Math.round((received / total) * 100)) : null)
    }
    const bytes = new Uint8Array(received)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }

    const session = await ort.InferenceSession.create(bytes, { executionProviders: ["wasm"], graphOptimizationLevel: "all" })
    sharedSession = session
    onProgress(100)
    return session
  })()

  try {
    return await sharedModelPromise
  } catch (error) {
    sharedModelPromise = null
    throw error
  }
}

function preprocessImage(file: File): Promise<ort.Tensor> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas")
        canvas.width = INPUT_SIZE
        canvas.height = INPUT_SIZE
        const context = canvas.getContext("2d", { willReadFrequently: true })
        if (!context) throw new Error("Could not prepare the image for AI processing.")
        // Preserve the full image with letterboxing. This is a prototype preprocessing
        // choice; the production pipeline should use a validated pet detector/crop.
        context.fillStyle = "#777777"
        context.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE)
        const scale = Math.min(INPUT_SIZE / image.width, INPUT_SIZE / image.height)
        const width = Math.round(image.width * scale)
        const height = Math.round(image.height * scale)
        context.drawImage(image, (INPUT_SIZE - width) / 2, (INPUT_SIZE - height) / 2, width, height)
        const pixels = context.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE).data
        const tensorData = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE)
        const plane = INPUT_SIZE * INPUT_SIZE
        for (let i = 0; i < plane; i++) {
          tensorData[i] = ((pixels[i * 4] / 255) - MEAN[0]) / STD[0]
          tensorData[plane + i] = ((pixels[i * 4 + 1] / 255) - MEAN[1]) / STD[1]
          tensorData[plane * 2 + i] = ((pixels[i * 4 + 2] / 255) - MEAN[2]) / STD[2]
        }
        resolve(new ort.Tensor("float32", tensorData, [1, 3, INPUT_SIZE, INPUT_SIZE]))
      } catch (error) {
        reject(error)
      } finally {
        URL.revokeObjectURL(objectUrl)
      }
    }
    image.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("Could not read this image.")) }
    image.src = objectUrl
  })
}

async function getEmbedding(session: ort.InferenceSession, file: File) {
  const input = await preprocessImage(file)
  const inputName = session.inputNames[0]
  const outputName = session.outputNames[0]
  if (!inputName || !outputName) throw new Error("The model input/output contract was unexpected.")
  const output = await session.run({ [inputName]: input })
  const values = Array.from(output[outputName].data as Float32Array)
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0))
  if (!norm || !Number.isFinite(norm)) throw new Error("The model returned an invalid embedding.")
  return values.map((value) => value / norm)
}

function cosineSimilarity(a: number[], b: number[]) {
  if (a.length !== b.length) throw new Error("Embedding dimensions did not match.")
  return a.reduce((sum, value, index) => sum + value * b[index], 0)
}

function PhotoSlot({ title, description, file, onChange }: { title: string; description: string; file: File | null; onChange: (file: File | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  function selectFile(next: File | null) {
    if (preview) URL.revokeObjectURL(preview)
    setPreview(next ? URL.createObjectURL(next) : null)
    onChange(next)
  }
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="mb-2 font-semibold">{title}</div>
      <p className="mb-3 text-sm text-muted-foreground">{description}</p>
      {preview ? (
        <div className="relative mb-3 overflow-hidden rounded-xl bg-muted">
          <img src={preview} alt={title} className="max-h-72 w-full object-contain" />
          <button type="button" onClick={() => selectFile(null)} aria-label="Remove photo" className="absolute right-2 top-2 rounded-full bg-background/90 p-2 shadow"><X className="size-4" /></button>
        </div>
      ) : (
        <button type="button" onClick={() => inputRef.current?.click()} className="mb-3 flex min-h-44 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/30 text-sm text-muted-foreground hover:bg-muted/60">
          <ImagePlus className="size-8" /> Choose photo
        </button>
      )}
      {file && <p className="mb-2 break-all text-xs text-muted-foreground">{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</p>}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(event) => { selectFile(event.target.files?.[0] ?? null); event.target.value = "" }} />
      {preview && <button type="button" onClick={() => inputRef.current?.click()} className="text-sm underline underline-offset-4">Change photo</button>}
    </div>
  )
}

export function ScanAPetLab() {
  const [referenceFile, setReferenceFile] = useState<File | null>(null)
  const [scanFile, setScanFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null)
  const [status, setStatus] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [score, setScore] = useState<number | null>(null)
  const [modelReady, setModelReady] = useState(false)

  async function compare() {
    if (!referenceFile || !scanFile || loading) return
    setError(null)
    setScore(null)
    setLoading(true)
    try {
      setStatus("Loading the on-device model. The first download is about 89 MB…")
      const session = await loadModel(handleDownloadProgress)
      setModelReady(true)
      setStatus("Analyzing the first photo on this device…")
      const reference = await getEmbedding(session, referenceFile)
      setStatus("Analyzing the second photo on this device…")
      const scan = await getEmbedding(session, scanFile)
      setScore(cosineSimilarity(reference, scan))
      setStatus("Comparison complete. Both photos were processed locally.")
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The comparison failed.")
      setStatus("")
    } finally {
      setLoading(false)
    }
  }

  function handleDownloadProgress(progress: number | null) {
    setDownloadProgress(progress)
    if (progress !== null) setStatus(`Downloading AI model: ${progress}%`)
    else setStatus("Downloading AI model…")
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-6 sm:px-6">
      <Link href="/" className="mb-5 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Back to Pet Alert PH</Link>
      <header className="mb-6 rounded-2xl border bg-card p-5 sm:p-7">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-300"><BrainCircuit className="size-5" /> Experimental model test</div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Scan a Pet — Local AI Lab</h1>
        <p className="mt-2 text-muted-foreground">Compare two pet photos using an AI model running on your device. This prototype does not search Pet Alert PH reports or submit photos.</p>
        <div className="mt-4 flex items-start gap-2 rounded-xl bg-muted p-3 text-sm"><ShieldCheck className="mt-0.5 size-4 shrink-0" /><span>Photos are read in your browser and are not uploaded. The AI model file is downloaded from Hugging Face (about 89 MB) when first needed.</span></div>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <PhotoSlot title="Photo A — Reference" description="Choose a photo of the missing pet. Try to show the animal clearly, ideally filling most of the frame." file={referenceFile} onChange={setReferenceFile} />
        <PhotoSlot title="Photo B — Comparison" description="Choose another photo that may show the same animal. Different angles and lighting are useful tests." file={scanFile} onChange={setScanFile} />
      </div>

      <button type="button" onClick={() => void compare()} disabled={!referenceFile || !scanFile || loading} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">
        {loading ? <Loader2 className="size-4 animate-spin" /> : <BrainCircuit className="size-4" />}{loading ? "Processing locally…" : "Compare photos on this device"}
      </button>

      {loading && downloadProgress !== null && downloadProgress < 100 && <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${downloadProgress}%` }} /></div>}
      {status && <p role="status" className="mt-3 text-center text-sm text-muted-foreground">{status}</p>}
      {modelReady && <div className="mt-3 flex items-center justify-center gap-1 text-xs text-green-700 dark:text-green-400"><CheckCircle2 className="size-4" /> Model loaded in this page session</div>}
      {error && <div role="alert" className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
      {score !== null && <section className="mt-5 rounded-2xl border bg-card p-5 text-center">
        <p className="text-sm text-muted-foreground">Cosine similarity (prototype)</p>
        <div className="my-2 text-4xl font-bold tabular-nums">{score.toFixed(4)}</div>
        <p className="text-sm">Higher values indicate closer embeddings for this model. This is <strong>not</strong> a probability or a verified identity.</p>
      </section>}
      <section className="mt-6 rounded-2xl border p-4 text-sm text-muted-foreground">
        <h2 className="mb-2 font-semibold text-foreground">Important limitations</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>This is a model/preprocessing experiment, not the production Scan a Pet feature.</li>
          <li>Prototype preprocessing preserves the full photo with letterboxing; the model's published contract expects an animal crop. This may reduce accuracy.</li>
          <li>The model has reported stronger cat than whole-body dog identification results. We must test Filipino street-pet photos and different viewpoints.</li>
          <li>Similarity scores must be calibrated with real test photos before we decide matching thresholds.</li>
          <li>It uses single-threaded WASM CPU inference for broad compatibility; this may be slow on older devices.</li>
        </ul>
      </section>
      <p className="mt-4 text-xs text-muted-foreground">Model: {MODEL_VERSION} · ONNX · 512-dimensional embeddings · 224×224 input</p>
    </main>
  )
}
