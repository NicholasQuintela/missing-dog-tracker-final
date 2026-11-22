"use client"

import { useRef, useState } from "react"
import { ArrowLeft, BrainCircuit, ImagePlus, Loader2, Search, ShieldCheck, X } from "lucide-react"
import Link from "next/link"
import * as ort from "onnxruntime-web"
import { publicPhotoSrc } from "@/lib/public-photo"

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
    ort.env.wasm.numThreads = 1
    ort.env.wasm.proxy = false
    onProgress(0)
    const response = await fetch(MODEL_URL, { cache: "force-cache" })
    if (!response.ok) throw new Error(`AI model download failed (${response.status}).`)
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
      onProgress(total ? Math.min(100, Math.round(received / total * 100)) : null)
    }
    const bytes = new Uint8Array(received)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
    const session = await ort.InferenceSession.create(bytes, { executionProviders: ["wasm"], graphOptimizationLevel: "all" })
    sharedSession = session
    onProgress(100)
    return session
  })()
  try { return await sharedModelPromise } catch (error) { sharedModelPromise = null; throw error }
}

function preprocessImage(file: Blob): Promise<ort.Tensor> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas")
        canvas.width = INPUT_SIZE
        canvas.height = INPUT_SIZE
        const context = canvas.getContext("2d", { willReadFrequently: true })
        if (!context) throw new Error("Could not prepare this photo for AI processing.")
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
          tensorData[i] = (pixels[i * 4] / 255 - MEAN[0]) / STD[0]
          tensorData[plane + i] = (pixels[i * 4 + 1] / 255 - MEAN[1]) / STD[1]
          tensorData[plane * 2 + i] = (pixels[i * 4 + 2] / 255 - MEAN[2]) / STD[2]
        }
        resolve(new ort.Tensor("float32", tensorData, [1, 3, INPUT_SIZE, INPUT_SIZE]))
      } catch (error) { reject(error) }
      finally { URL.revokeObjectURL(objectUrl) }
    }
    image.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("Could not read this photo.")) }
    image.src = objectUrl
  })
}

async function getEmbedding(session: ort.InferenceSession, file: Blob) {
  const input = await preprocessImage(file)
  const inputName = session.inputNames[0]
  const outputName = session.outputNames[0]
  if (!inputName || !outputName) throw new Error("The AI model input/output contract was unexpected.")
  const output = await session.run({ [inputName]: input })
  const values = Array.from(output[outputName].data as Float32Array)
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0))
  if (!norm || !Number.isFinite(norm)) throw new Error("The AI model returned an invalid embedding.")
  return values.map((value) => value / norm)
}

function cosineSimilarity(a: number[], b: number[]) {
  if (a.length !== b.length) throw new Error("The embedding dimensions did not match.")
  return a.reduce((sum, value, index) => sum + value * b[index], 0)
}

type Candidate = {
  id: string
  type: "missing_report" | "sighting"
  title: string
  description?: string | null
  breed?: string | null
  photo_url: string | null
  photo_path?: string | null
  region?: string | null
  city?: string | null
  barangay?: string | null
  created_at?: string | null
  seen_at?: string | null
  status: string
}
type RawMissingReport = { id: string; name: string; breed_details?: string | null; photo_url: string | null; photo_path?: string | null; region?: string | null; city?: string | null; barangay?: string | null; created_at?: string | null; status: string }
type RawSighting = { id: string; title: string; description?: string | null; photo_url: string | null; photo_path?: string | null; region?: string | null; city?: string | null; barangay?: string | null; seen_at?: string | null; created_at?: string | null; status: string }
type Match = Candidate & { similarity: number; photoSrc: string }
type CandidateResponse = { missingReports: RawMissingReport[]; sightings: RawSighting[]; limits?: { missingReports: number; sightings: number } }

function candidatePhoto(candidate: Candidate) {
  return publicPhotoSrc(candidate.photo_url, candidate.photo_path)
}

function PetPhotoPicker({ file, onChange }: { file: File | null; onChange: (file: File | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  function choose(next: File | null) {
    if (preview) URL.revokeObjectURL(preview)
    setPreview(next ? URL.createObjectURL(next) : null)
    onChange(next)
  }
  return <div className="rounded-2xl border bg-card p-4">
    <div className="mb-2 font-semibold">Your pet photo</div>
    <p className="mb-3 text-sm text-muted-foreground">Upload one clear photo of the pet you want to search for.</p>
    {preview ? <div className="relative mb-3 overflow-hidden rounded-xl bg-muted"><img src={preview} alt="Uploaded pet" className="max-h-80 w-full object-contain" /><button type="button" onClick={() => choose(null)} aria-label="Remove photo" className="absolute right-2 top-2 rounded-full bg-background/90 p-2 shadow"><X className="size-4" /></button></div> : <button type="button" onClick={() => inputRef.current?.click()} className="mb-3 flex min-h-48 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/30 text-sm text-muted-foreground hover:bg-muted/60"><ImagePlus className="size-8" />Choose a photo</button>}
    {file && <p className="mb-2 break-all text-xs text-muted-foreground">{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</p>}
    <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(event) => { choose(event.target.files?.[0] ?? null); event.target.value = "" }} />
    {preview && <button type="button" onClick={() => inputRef.current?.click()} className="text-sm underline underline-offset-4">Change photo</button>}
  </div>
}

function MatchCard({ match }: { match: Match }) {
  const reportHref = match.type === "missing_report" ? `/?report=${encodeURIComponent(match.id)}` : `/?sighting=${encodeURIComponent(match.id)}`
  const location = [match.barangay, match.city, match.region].filter(Boolean).join(", ")
  const date = match.type === "sighting" ? match.seen_at : match.created_at
  return <article className="overflow-hidden rounded-2xl border bg-card">
    <div className="flex gap-3 p-3">
      <img src={match.photoSrc} alt="Pet in possible match" className="size-28 shrink-0 rounded-xl bg-muted object-cover" loading="lazy" />
      <div className="min-w-0 flex-1">
        <span className="inline-flex rounded-full bg-muted px-2 py-1 text-xs font-medium">{match.type === "missing_report" ? "Missing pet" : "Pet sighting"}</span>
        <h3 className="mt-1 line-clamp-2 font-semibold">{match.title}</h3>
        {match.breed && <p className="text-sm text-muted-foreground">{match.breed}</p>}
        {location && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{location}</p>}
        {date && <p className="mt-1 text-xs text-muted-foreground">{new Date(date).toLocaleDateString()}</p>}
        <p className="mt-2 text-xs text-muted-foreground">Similarity score: {match.similarity.toFixed(3)} <span className="italic">(not a probability)</span></p>
      </div>
    </div>
    {match.description && <p className="px-3 pb-3 text-sm text-muted-foreground line-clamp-3">{match.description}</p>}
    <Link href={reportHref} className="block border-t px-3 py-2.5 text-sm font-medium hover:bg-muted">View {match.type === "missing_report" ? "missing report" : "sighting"} →</Link>
  </article>
}

export function ScanAPet() {
  const [photo, setPhoto] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null)
  const [status, setStatus] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [scannedCount, setScannedCount] = useState(0)

  function handleDownloadProgress(progress: number | null) {
    setDownloadProgress(progress)
    setStatus(progress !== null ? `Downloading AI model: ${progress}%` : "Downloading AI model…")
  }

  async function scan() {
    if (!photo || loading) return
    setError(null)
    setMatches([])
    setScannedCount(0)
    setLoading(true)
    try {
      setStatus("Loading the on-device AI model. Its first download is approximately 89 MB…")
      const session = await loadModel(handleDownloadProgress)
      setDownloadProgress(100)
      setStatus("Analyzing your photo on this device…")
      const uploadedEmbedding = await getEmbedding(session, photo)

      setStatus("Loading active Missing Pet reports and Pet Sightings…")
      const candidateResponse = await fetch("/api/public/scan-candidates", { cache: "no-store" })
      if (!candidateResponse.ok) throw new Error("Unable to retrieve active Pet Alert PH reports for comparison.")
      const payload = await candidateResponse.json() as CandidateResponse
      const candidates: Candidate[] = [
        ...(payload.missingReports || []).map((item) => ({ ...item, type: "missing_report" as const, title: item.name || "Missing pet", breed: item.breed_details || null })),
        ...(payload.sightings || []).map((item) => ({ ...item, type: "sighting" as const, title: item.title || "Pet sighting" })),
      ]
        .filter((candidate) => candidate.photo_path || candidate.photo_url)
      if (!candidates.length) {
        setStatus("No active reports or sightings with photos were available to compare.")
        return
      }

      const found: Match[] = []
      let skipped = 0
      for (let index = 0; index < candidates.length; index++) {
        const candidate = candidates[index]
        setStatus(`Comparing photo ${index + 1} of ${candidates.length} active reports and sightings…`)
        try {
          const imageResponse = await fetch(candidatePhoto(candidate), { cache: "force-cache" })
          if (!imageResponse.ok) {
            skipped++
          } else {
            const blob = await imageResponse.blob()
            const candidateFile = new File([blob], "pet-alert-candidate.jpg", { type: blob.type || "image/jpeg" })
            const embedding = await getEmbedding(session, candidateFile)
            found.push({ ...candidate, similarity: cosineSimilarity(uploadedEmbedding, embedding), photoSrc: candidatePhoto(candidate) })
          }
        } catch { skipped++ }
        finally { setScannedCount(index + 1) }
      }
      found.sort((a, b) => b.similarity - a.similarity)
      setMatches(found.slice(0, 10))
      setStatus(`Scan complete. Compared ${candidates.length - skipped} report photos locally${skipped ? `; skipped ${skipped} unavailable photos` : ""}.`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The scan failed. Please try again.")
      setStatus("")
    } finally {
      setLoading(false)
    }
  }

  const maxCandidates = 60
  return <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-6 sm:px-6">
    <Link href="/" className="mb-5 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Back to Pet Alert PH</Link>
    <header className="mb-6 rounded-2xl border bg-card p-5 sm:p-7">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium"><BrainCircuit className="size-5" />Scan a Pet</div>
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Find similar pets on Pet Alert PH</h1>
      <p className="mt-2 text-muted-foreground">Upload one photo. We'll compare it with active Missing Pet reports and Pet Sightings and show the closest visual matches.</p>
      <div className="mt-4 flex items-start gap-2 rounded-xl bg-muted p-3 text-sm"><ShieldCheck className="mt-0.5 size-4 shrink-0" /><span>Your uploaded photo is processed on your device and isn't uploaded. Pet Alert PH report photos are downloaded for local comparison. The first model download is about 89 MB.</span></div>
    </header>

    <PetPhotoPicker file={photo} onChange={(next) => { setPhoto(next); setMatches([]); setError(null); setStatus(""); setScannedCount(0) }} />
    <button type="button" onClick={() => void scan()} disabled={!photo || loading} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">{loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}{loading ? "Scanning locally…" : "Scan for Similar Pets"}</button>
    {loading && downloadProgress !== null && downloadProgress < 100 && <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${downloadProgress}%` }} /></div>}
    {loading && scannedCount > 0 && <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${Math.min(100, scannedCount / maxCandidates * 100)}%` }} /></div>}
    {status && <p role="status" className="mt-3 text-center text-sm text-muted-foreground">{status}</p>}
    {error && <div role="alert" className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
    {!loading && matches.length > 0 && <section className="mt-6 space-y-3"><div><h2 className="text-xl font-bold">Possible matches</h2><p className="text-sm text-muted-foreground">Ranked by visual similarity. These are suggestions, not confirmed identities.</p></div><div className="grid gap-3 sm:grid-cols-2">{matches.map((match) => <MatchCard key={`${match.type}:${match.id}`} match={match} />)}</div></section>}
    {!loading && status.startsWith("Scan complete") && matches.length === 0 && <div className="mt-5 rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">No matching photos were available to display. Try a clearer pet photo or scan again later.</div>}
    <section className="mt-6 rounded-2xl border p-4 text-sm text-muted-foreground"><h2 className="mb-2 font-semibold text-foreground">Prototype limits</h2><ul className="list-disc space-y-1 pl-5"><li>Each scan compares with the latest 30 active Missing Pet reports and latest 30 active Pet Sightings (up to 60 photos).</li><li>Only reports with an available photo can be compared.</li><li>This model and similarity ranking have not yet been validated for individual-pet identification. Similarity scores are not probabilities or proof that two photos show the same animal.</li><li>Results should be verified by the report owner or sighting reporter before any reunion or claim.</li><li>Inference runs on this device using single-threaded WASM CPU and may take time on older phones or computers.</li></ul></section>
    <p className="mt-4 text-xs text-muted-foreground">Model: {MODEL_VERSION} · ONNX · 512-dimensional embeddings · 224×224 input</p>
  </main>
}
