-- 001_initial.down.sql
DO 
DECLARE
  schema_exists BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'public') INTO schema_exists;
  IF schema_exists THEN
    EXECUTE 'DROP SCHEMA public CASCADE';
    EXECUTE 'CREATE SCHEMA public';
    EXECUTE 'GRANT ALL ON SCHEMA public TO public';
  END IF;
END ;
