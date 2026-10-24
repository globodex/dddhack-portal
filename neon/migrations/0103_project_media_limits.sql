-- Original upload bytes and optimized saved web-image bytes have distinct limits.
-- This additive upgrade preserves 0004 checksums and all receipt/auth/lease guards.
ALTER TABLE portal_media_uploads
  DROP CONSTRAINT portal_media_uploads_byte_length_check,
  DROP CONSTRAINT portal_media_uploads_image_byte_length_check,
  DROP CONSTRAINT portal_media_uploads_width_check,
  DROP CONSTRAINT portal_media_uploads_height_check,
  ADD CONSTRAINT portal_media_uploads_byte_length_check CHECK (
    byte_length BETWEEN 32 AND CASE kind WHEN 'logo' THEN 1000000 ELSE 5000000 END
  ),
  ADD CONSTRAINT portal_media_uploads_image_byte_length_check CHECK (
    image_byte_length BETWEEN 32 AND CASE kind WHEN 'logo' THEN 131072 ELSE 393216 END
  ),
  ADD CONSTRAINT portal_media_uploads_width_check CHECK (width BETWEEN 1 AND 4096),
  ADD CONSTRAINT portal_media_uploads_height_check CHECK (height BETWEEN 1 AND 4096);
