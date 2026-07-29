# Pet Alert PH — Fresh Location Selection Fix

This update prevents new missing-pet and sighting reports from inheriting the previous report pin.

## Behavior

- Opening either report form starts with no selected report pin.
- Closing, cancelling, or successfully submitting clears the temporary location state.
- A report cannot be posted until the user searches an address, taps the map, or explicitly chooses their current location for the report.
- The map may open near the current browsing area, but that center is not treated as the report pin.
- Pressing Locate me asks whether the current location should become the report pin. Cancelling shows the private blue location without selecting it for the report.

No SQL changes are required.
