ALTER TABLE guild_settings
  ADD COLUMN card_accent TEXT
    CHECK (card_accent IS NULL OR card_accent GLOB '#[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]');