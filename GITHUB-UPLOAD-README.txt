PET ALERT PH — SCAN A PET LAB v1
GitHub upload notes

IMPORTANT: This is an experimental model-testing page only. It is not the production Scan a Pet feature and is not connected to the live report database or sighting/notification flow.

GITHUB UPLOAD
1. Extract this ZIP on your PC.
2. Open the extracted 'missing-dog-tracker-final-main' folder.
3. Open your existing Pet Alert PH GitHub repository in your browser.
4. Choose Add file > Upload files.
5. Drag the extracted folder's CONTENTS (files and folders) into the upload area. Do not upload this ZIP archive itself.
6. Review the changed files, then commit.
7. Vercel should deploy automatically if your repository is connected.

SUPABASE / VERCEL
- This lab page requires no new Vercel environment variables.
- Do NOT run SCAN-A-PET-EMBEDDINGS-STARTER.sql in production. It is a proposed starter migration, not required by the local photo-comparison lab. It has not been validated against the production schema.
- The lab route is /scan-a-pet-lab and is not added to the public navigation.
- Model file is downloaded from Hugging Face on first use (approximately 89 MB). Photo files selected in this page are processed in-browser and are not uploaded by the lab.

MODEL TEST
Visit https://YOUR-DOMAIN/scan-a-pet-lab after deployment. Select two images and run comparison. This is experimental; cosine similarity is not an identity probability.

Preserve the existing photo storage/delivery, cache, report, sighting, and notification features.
