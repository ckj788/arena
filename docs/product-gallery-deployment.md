# Product image gallery

Run `lib/migrations/20260919_product_gallery.sql` in Supabase SQL Editor after the already-installed product safety migration, then deploy this code. Do not re-run old profile migrations.

- Adds an ordered array of up to five images. Old single screenshots become the first image without deleting products or changing their URLs.
- The original file limit is 5,000,000 bytes per image. The browser optimizes accepted PNG/JPEG/WebP files to at most 1600px and uploads each separately below the existing 1 MB storage limit. No bucket size increase is needed.
- Logo remains separate. Gallery images appear only on the product detail page; submission/edit forms provide previews, ordering and removal. Console lists, Discover, Arena and Champions continue using logos only.
- Image edits reset link trust, including changes to the second through fifth image. Restricted products do not expose their gallery through the public view.
- Existing per-user image upload quota increases from 10 to 30 per day, enough for the existing three-submission limit with five images and one logo each. Other rate limits are unchanged.
- A failed upload preserves successfully uploaded URLs for retry. If the browser cannot preserve a large draft across OAuth, sign-in stops with an explicit message rather than silently discarding the draft.

Smoke check after deployment: edit your own product, add five images, reorder, save, reopen the editor, and inspect its detail page. Check thumbnail selection, enlarge, Escape, mobile layout, and removal of all images. A sixth image or original file over 5 MB must be rejected. No real product is submitted by the automated local fixture tests.
