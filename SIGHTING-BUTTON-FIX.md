# Pet Alert PH sighting button fix

This build fixes the sighting form not appearing after clicking **Report sighting**.

Changes:
- Renders dialogs through a document-body portal so Leaflet/map stacking contexts cannot hide them.
- Raises dialog z-index above all map layers.
- Gives the embedded sighting location picker a fresh map instance whenever the dialog opens.
- Sets the sighting and report header controls explicitly to `type="button"`.

Deploy by replacing the current GitHub project files with the contents of this folder. No new SQL migration is required for this UI fix.
