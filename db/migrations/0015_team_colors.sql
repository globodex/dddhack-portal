ALTER TABLE `team_styles` ADD `color_key` text;

CREATE TRIGGER team_color_insert BEFORE INSERT ON team_styles WHEN NEW.color_key IS NOT NULL AND NEW.color_key NOT IN ('cobalt','forest','violet','ember','graphite','yellow','coral','grey') BEGIN SELECT RAISE(ABORT,'TEAM_COLOR_INVALID'); END;

CREATE TRIGGER team_color_update BEFORE UPDATE ON team_styles WHEN NEW.color_key IS NOT NULL AND NEW.color_key NOT IN ('cobalt','forest','violet','ember','graphite','yellow','coral','grey') BEGIN SELECT RAISE(ABORT,'TEAM_COLOR_INVALID'); END;
