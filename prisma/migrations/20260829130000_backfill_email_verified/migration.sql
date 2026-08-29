-- Grandfathers every account that existed before email verification shipped.
--
-- Two groups would otherwise be locked out of /dashboard with no way back in:
--   * OAuth users — `events.linkAccount` in auth.ts stamps `emailVerified`, but
--     it fires only when an account is linked, so accounts linked earlier are
--     never revisited.
--   * Credentials users who registered before the flow existed and so were
--     never sent a link.
--
-- Only rows created before this migration are touched; every registration from
-- here on has to go through the email.
UPDATE "User"
SET "emailVerified" = NOW()
WHERE "emailVerified" IS NULL;
