-- PostgreSQL helpers for the deliberately small SQLite compatibility surface.
CREATE EXTENSION IF NOT EXISTS citext;

CREATE FUNCTION portal_json_valid(document text) RETURNS boolean
 LANGUAGE plpgsql IMMUTABLE STRICT AS $portal$
BEGIN
 PERFORM document::jsonb;
 RETURN true;
EXCEPTION WHEN invalid_text_representation THEN RETURN false;
END;
$portal$;

CREATE FUNCTION portal_json_extract(document text, path text) RETURNS text
 LANGUAGE plpgsql IMMUTABLE STRICT AS $portal$
DECLARE value jsonb;
BEGIN
 IF path !~ '^\$\.[A-Za-z_][A-Za-z0-9_]*$' THEN
  RAISE EXCEPTION 'UNSUPPORTED_JSON_PATH' USING ERRCODE = '22023';
 END IF;
 value := document::jsonb -> substring(path FROM 3);
 IF value IS NULL OR value = 'null'::jsonb THEN RETURN NULL; END IF;
 RETURN value #>> '{}';
END;
$portal$;

CREATE FUNCTION portal_json_each(document text) RETURNS TABLE(value text)
 LANGUAGE plpgsql IMMUTABLE STRICT AS $portal$
BEGIN
 IF jsonb_typeof(document::jsonb) <> 'array' THEN
  RAISE EXCEPTION 'JSON_ARRAY_REQUIRED' USING ERRCODE = '22023';
 END IF;
 RETURN QUERY SELECT element #>> '{}' FROM jsonb_array_elements(document::jsonb) AS source(element);
END;
$portal$;

-- Same compact JSON string array as JSON.stringify used by scoped guard tokens.
CREATE FUNCTION portal_json_array(VARIADIC items text[]) RETURNS text
 LANGUAGE sql IMMUTABLE AS $portal$
 SELECT '[' || COALESCE(string_agg(COALESCE(to_json(item)::text,'null'), ',' ORDER BY position), '') || ']'
 FROM unnest(items) WITH ORDINALITY AS source(item, position);
$portal$;

CREATE FUNCTION portal_instr(document text, needle text) RETURNS integer
 LANGUAGE sql IMMUTABLE STRICT AS $portal$ SELECT strpos(document, needle); $portal$;

-- Explicit timezone avoids server TimeZone/DateStyle changing submission windows.
-- Invalid or ambiguous timestamps return NULL and the submission guard rejects them.
CREATE FUNCTION portal_instant(value text) RETURNS timestamptz
 LANGUAGE plpgsql IMMUTABLE STRICT AS $portal$
BEGIN
 IF value !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$' THEN RETURN NULL; END IF;
 RETURN value::timestamptz;
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RETURN NULL;
END;
$portal$;
