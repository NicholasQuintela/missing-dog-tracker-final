# Scan a Pet — first website update (experimental lab)

## What this update includes

- A new local-only model experiment page at `/scan-a-pet-lab`.
- It compares two selected images by generating embeddings in the user's browser with ONNX Runtime Web/WASM CPU.
- Photos are not uploaded by this lab page. The ONNX model is downloaded from Hugging Face on first use (about 89.2 MB); inference happens in the browser.
- The model version is pinned to commit `9dd4c915be29a81b116b3e30eb996c59d0e7ede0`.
- `SCAN-A-PET-EMBEDDINGS-STARTER.sql` is a proposed database starter migration only. Do not apply it to production until reviewed and backed up.

## Candidate model (not production-approved)

`open-noodle/pet-recognition-small`, Apache-2.0, 512-dimensional normalized embeddings. The model card reports benchmark Top-1 identification of 53.5% on its Dogs-World whole-animal test and 91.3% on Cat Individual Images. These are the publisher's reported results, not Pet Alert PH results. Its input contract expects a whole-animal crop, while this lab preserves/letterboxes the selected photo; accuracy may therefore be lower. We need real local tests before deciding if this model is acceptable.

Model file URL:

`https://huggingface.co/open-noodle/pet-recognition-small/resolve/9dd4c915be29a81b116b3e30eb996c59d0e7ede0/recognition/model.onnx`

## Local setup

1. Extract the repository ZIP.
2. Install Node.js LTS and pnpm (the repository has `pnpm-lock.yaml`).
3. Open a terminal in the extracted project folder.
4. Run:

   ```bash
   pnpm install
   pnpm dev
   ```

5. Open `http://localhost:3000/scan-a-pet-lab`.
6. Select two photos of the same pet (ideally different views), then click **Compare photos on this device**.
7. The first run downloads the model. Use Wi-Fi if possible. Keep the page open until comparison finishes.

The page uses one WASM thread and CPU execution for compatibility. Old/low-memory phones may be slow or unable to load the model. The lab is not linked in the main site navigation and is not a live feature.

## What's not implemented yet

- Automatic animal detection/cropping.
- Embedding generation when missing reports or sightings are submitted.
- Production embedding storage, migration/rollout, or vector search.
- The live Scan a Pet results list.
- Possible-sighting claim workflow and owner verification notifications.
- Android integration or shared model compatibility testing.
- Device minimum specification validation.

The SQL starter defines a separate embedding table and a restricted RPC returning active missing-report IDs and similarity scores. It does not alter the existing photo upload, R2, Supabase photo backup, cache, or proxy behavior. Apply database changes only after reviewing them and testing against a non-production Supabase project.

## Test plan for model evaluation

Record at least:
- Same dog, different photos / angles / lighting.
- Different dogs with similar colors and breeds.
- Same cat, different photos.
- Different cats with similar markings.
- Photos with multiple animals.
- Photos where the animal is off-center or far away.
- Performance on the user's 2GB tablet, 4GB phone, and 6GB+ phone if available.

Do not treat a cosine score as a probability of identity. Matching thresholds must be calibrated on a representative validation set.
